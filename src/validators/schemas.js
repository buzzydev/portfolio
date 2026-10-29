const { z } = require('zod');
const { isHttpUrl } = require('./fields');

const passwordRule = z.string().min(12, 'Use at least 12 characters').max(200, 'Password is too long');

const login = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

const contact = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Enter a valid email address').max(254),
  subject: z.string().trim().max(150).default(''),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(4000, 'Message is too long'),
});

const username = z.string().trim().regex(/^[a-zA-Z0-9_.-]{3,32}$/, 'Username: 3-32 letters, numbers, dot, dash or underscore');
const optionalUrl = z.string().trim().max(300).default('').refine((v) => v === '' || isHttpUrl(v), 'Must start with http:// or https://');

const profile = z.object({
  username,
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  displayName: z.string().trim().max(80).default(''),
  bio: z.string().trim().max(1000).default(''),
  githubUrl: optionalUrl,
  telegramUrl: optionalUrl,
  preferredTheme: z.enum(['SYSTEM', 'LIGHT', 'DARK']),
  currentPassword: z.string().max(200).default(''),
});

const passwordChange = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password').max(200), newPassword: passwordRule, confirmPassword: z.string().max(200) })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

const ROLES = ['SENIOR_ADMIN', 'ADMIN', 'JUNIOR_ADMIN'];
const userCreate = z.object({
  username,
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().max(80).default(''),
  role: z.enum(ROLES),
  password: passwordRule,
});
const userUpdate = z.object({
  displayName: z.string().trim().max(80).default(''),
  role: z.enum(ROLES),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  password: z.string().max(200).default('').refine((v) => v === '' || v.length >= 12, 'Use at least 12 characters'),
});

const vaultEntry = z.object({
  service: z.string().trim().min(1, 'Service name is required').max(120),
  username: z.string().trim().max(200).default(''),
  url: z.string().trim().max(500).default('').refine((v) => v === '' || isHttpUrl(v), 'URL must start with http:// or https://'),
  category: z.string().trim().max(40).default('General'),
  password: z.string().max(1000).default(''),
  notes: z.string().max(2000).default(''),
});

module.exports = { login, contact, profile, passwordChange, userCreate, userUpdate, vaultEntry, passwordRule };
