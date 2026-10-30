import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

/** Zod type for a Mongo ObjectId string. */
export const objectIdSchema = z.string().refine((v) => isValidObjectId(v) && v.length === 24, 'Must be a valid id');

export const idParams = (name: string) => z.object({ [name]: objectIdSchema });
