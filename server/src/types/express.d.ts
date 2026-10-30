import type { Role } from '../config/constants.js';

export interface AuthContext {
  userId: string;
  role: Role;
  /** Mongo _id of the Author document, null for admins. */
  authorId: string | null;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}
