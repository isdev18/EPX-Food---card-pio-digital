import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantId: string;
  restaurant: { name: string };
};

function authResult(user: AuthUser) {
  const token = jwt.sign({ userId: user.id, restaurantId: user.restaurantId, role: user.role }, env.JWT_SECRET, { expiresIn: '12h' });
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, restaurant: user.restaurant.name } };
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurante';
}

export async function signIn(email: string, password: string) {
  const user = await prisma.user.findFirst({ where: { email: email.toLowerCase(), active: true }, include: { restaurant: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return authResult(user);
}

export async function registerOwner(input: { ownerName: string; restaurantName: string; email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  if (await prisma.user.findFirst({ where: { email } })) return null;

  const baseSlug = slugify(input.restaurantName);
  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const restaurant = await prisma.restaurant.create({
    data: {
      name: input.restaurantName.trim(),
      slug,
      users: {
        create: {
          name: input.ownerName.trim(),
          email,
          passwordHash,
          role: 'OWNER',
        },
      },
      categories: {
        create: [
          { name: 'Pizzas', icon: 'pizza', position: 0 },
          { name: 'Bebidas', icon: 'cup-soda', position: 1 },
        ],
      },
      pizzaSizes: {
        create: [
          { name: 'Pequena', slices: 4, maxFlavors: 1, priceMultiplier: 0.8 },
          { name: 'Média', slices: 6, maxFlavors: 2, priceMultiplier: 1 },
          { name: 'Grande', slices: 8, maxFlavors: 2, priceMultiplier: 1.2 },
        ],
      },
      crusts: { create: { name: 'Sem borda', price: 0 } },
    },
    include: { users: true },
  });
  const owner = restaurant.users[0];
  return authResult({ ...owner, restaurant: { name: restaurant.name } });
}
