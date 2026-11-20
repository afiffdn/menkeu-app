import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Alamat email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter').max(120, 'Nama maksimal 120 karakter'),
    email: z.string().trim().min(1, 'Alamat email wajib diisi').email('Format email tidak valid'),
    family_name: z
      .string()
      .trim()
      .max(120, 'Nama keluarga maksimal 120 karakter')
      .optional(),
    password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
    confirm_password: z.string().min(1, 'Konfirmasi kata sandi wajib diisi'),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Konfirmasi kata sandi tidak cocok',
    path: ['confirm_password'],
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;

export function buildRegisterPayload(values: RegisterFormValues): {
  name: string;
  email: string;
  password: string;
  family_name?: string;
} {
  const familyName = values.family_name?.trim();
  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    ...(familyName ? { family_name: familyName } : {}),
  };
}
