import { Router } from 'express';
import * as categoryController from '../controllers/categoryController.js';

export const categoryRouter = Router();

categoryRouter.get('/', categoryController.tree);
categoryRouter.get('/:slug/schema', categoryController.schema);
