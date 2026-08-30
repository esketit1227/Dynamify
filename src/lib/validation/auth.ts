import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(255);

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export const signupSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1).max(100).optional(),
  organizationName: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(100),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password,
});
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
