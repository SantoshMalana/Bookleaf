import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { businessNow, toISODate } from '../../lib/clock.js';
import { summarizeAuthorRoyalty } from '../../domain/royalty.js';
import { authenticate } from '../../middleware/authenticate.js';
import { Author, Book, Ticket, User, type IBook } from '../../models/index.js';
import { toUserDto } from '../auth/auth.service.js';
import { Errors } from '../../lib/errors.js';

export const meRouter = Router();
meRouter.use(authenticate);

/** Profile + at-a-glance numbers for the author dashboard. */
meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const user = await User.findById(auth.userId).lean();
    if (!user) throw Errors.unauthenticated('Account no longer exists');
    if (auth.role === 'admin' || !auth.authorId) return res.json({ data: { user: toUserDto(user) } });

    const [author, books, activeTickets, totalTickets] = await Promise.all([
      Author.findById(auth.authorId).lean(),
      Book.find({ author: auth.authorId }).lean<IBook[]>(),
      Ticket.countDocuments({ author: auth.authorId, isActive: true }),
      Ticket.countDocuments({ author: auth.authorId }),
    ]);
    if (!author) throw Errors.notFound('Author');

    res.json({
      data: {
        user: toUserDto(user),
        author: { id: String(author._id), authorCode: author.authorCode, name: author.name, email: author.email, phone: author.phone, city: author.city, joinedDate: toISODate(author.joinedDate) },
        royalty: summarizeAuthorRoyalty(books, businessNow()),
        books: { total: books.length, live: books.filter((b) => b.status === 'Published & Live').length, inProduction: books.filter((b) => b.status !== 'Published & Live').length },
        tickets: { active: activeTickets, total: totalTickets },
      },
    });
  }),
);
