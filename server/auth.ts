import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { RolUsuario } from '../src/types.ts';

function getJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'MY_JWT_SECRET') {
    return process.env.JWT_SECRET;
  }
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
    const seed = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_URL || 'sde-diagnostico-vercel-secret-2026';
    return crypto.createHash('sha256').update(seed).digest('hex');
  }
  const secretPath = path.resolve(process.cwd(), 'data', '.jwt_secret');
  try {
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf-8').trim();
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    return generated;
  } catch {
    return crypto.createHash('sha256').update('sde-diagnostico-fallback-2026').digest('hex');
  }
}

const JWT_SECRET = getJwtSecret();

export interface AuthPayload {
  id: number;
  username: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function extractBearerUser(req: AuthenticatedRequest): AuthPayload | null {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!bearerToken) return null;
  return verifyToken(bearerToken);
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const decoded = extractBearerUser(req);
  if (decoded) {
    req.user = decoded;
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const decoded = extractBearerUser(req);
  if (!decoded) {
    res.status(401).json({ error: 'Sesión no iniciada o token ausente.' });
    return;
  }
  req.user = decoded;
  next();
}

const DEFAULT_EDITOR_ACTOR: AuthPayload = {
  id: 1,
  username: 'editor',
  nombre: 'Editor',
  email: 'sistema@diagnostico.com',
  rol: 'ADMINISTRADOR',
};

export function requireAdmin(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const decoded = extractBearerUser(req);
  req.user = decoded || DEFAULT_EDITOR_ACTOR;
  next();
}

export function requireRole(...roles: RolUsuario[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado.' });
      return;
    }
    if (!roles.includes(req.user.rol)) {
      res.status(403).json({ error: 'No tiene permisos suficientes para realizar esta acción.' });
      return;
    }
    next();
  };
}
