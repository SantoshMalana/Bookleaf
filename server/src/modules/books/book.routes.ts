import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { Errors } from '../../lib/errors.js';
import { businessNow } from '../../lib/clock.js';
import { objectIdSchema } from '../../lib/object-id.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { Author, Book, type IBook } from '../../models/index.js';
import { toBookDto, sumPending } from './book.dto.js';

export const bookRouter = Router();
bookRouter.use(authenticate);

/**
 * GET /books — an author gets their own books; an admin gets every book (optionally ?authorId=).
 */
bookRouter.get(
  '/',
  validate({ query: z.object({ authorId: objectIdSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const filter = auth.role === 'author' ? { author: auth.authorId } : req.query.authorId ? { author: req.query.authorId as string } : {};
    const books = await Book.find(filter).sort({ bookCode: 1 }).lean<IBook[]>();

    // The ₹1,000 payout threshold is account-level, so group by author before deriving payout state.
    const byAuthor = new Map<string, IBook[]>();
    for (const b of books) byAuthor.set(String(b.author), [...(byAuthor.get(String(b.author)) ?? []), b]);

    const now = businessNow();
    let authorNames = new Map<string, { name: string; authorCode: string }>();
    if (auth.role === 'admin') {
      const authors = await Author.find({ _id: { $in: [...byAuthor.keys()] } }).select('name authorCode').lean();
      authorNames = new Map(authors.map((a) => [String(a._id), { name: a.name, authorCode: a.authorCode }]));
    }

    const data = books.map((b) => ({
      ...toBookDto(b, sumPending(byAuthor.get(String(b.author))!), now),
      ...(auth.role === 'admin' ? { author: authorNames.get(String(b.author)) ?? null } : {}),
    }));
    res.json({ data });
  }),
);

bookRouter.get(
  '/:bookId',
  validate({ params: z.object({ bookId: objectIdSchema }) }),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const book = await Book.findOne({ _id: req.params.bookId, ...(auth.role === 'author' ? { author: auth.authorId } : {}) }).lean<IBook>();
    if (!book) throw Errors.notFound('Book'); // also returned for other authors' books
    const siblings = await Book.find({ author: book.author }).select('royaltyPending').lean<IBook[]>();
    res.json({ data: toBookDto(book, sumPending(siblings), businessNow()) });
  }),
);
