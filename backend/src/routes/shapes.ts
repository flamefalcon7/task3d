import { Hono } from 'hono';
import { SHAPE_CATALOG } from '../lib/catalog.js';

export const shapesRoute = new Hono();

shapesRoute.get('/', (c) => c.json(SHAPE_CATALOG));
