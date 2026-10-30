import bcrypt from 'bcryptjs';
import { Author, User, type IUser } from '../../models/index.js';
import { Errors } from '../../lib/errors.js';
import { signToken } from '../../middleware/authenticate.js';
import { env } from '../../config/env.js';

/** Compared against when the email is unknown, so response time doesn't reveal which emails exist. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, 10);

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: 'author' | 'admin';
  authorId: string | null;
}

export const toUserDto = (u: Pick<IUser, '_id' | 'name' | 'email' | 'role' | 'author'>): UserDto => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  authorId: u.author ? String(u.author) : null,
});

export async function login(email: string, password: string) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw Errors.invalidCredentials();

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  const token = signToken({ sub: String(user._id), role: user.role, aid: user.author ? String(user.author) : null, name: user.name, email: user.email });
  return { token, user: toUserDto(user) };
}

/** Demo-only helper: lists the seeded accounts so reviewers can sign in with one click. */
export async function demoAccounts() {
  if (!env.DEMO_MODE) throw Errors.notFound('Resource');
  const users = await User.find().sort({ role: 1, name: 1 }).lean<IUser[]>();
  const authors = await Author.find().lean();
  const city = new Map(authors.map((a) => [String(a._id), a.city]));
  return {
    authorPassword: env.SEED_AUTHOR_PASSWORD,
    adminPassword: env.SEED_ADMIN_PASSWORD,
    accounts: users.map((u) => ({ name: u.name, email: u.email, role: u.role, city: u.author ? (city.get(String(u.author)) ?? null) : null })),
  };
}
