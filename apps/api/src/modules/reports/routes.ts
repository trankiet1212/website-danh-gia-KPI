/**
 * /api/v1/reports — xem báo cáo (report.read) và xuất Excel/PDF (report.export), dữ liệu lọc theo phạm vi.
 */
import { Router, type Response } from 'express';
import {
  aggregateReportQuerySchema,
  agencyReportQuerySchema,
  exportFormatSchema,
  individualReportQuerySchema,
  unitReportQuerySchema,
  type ExportFormat,
} from '@kpi/shared';
import type { z } from 'zod';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validQuery } from '../../lib/http.js';
import { exportLimiter } from '../../middlewares/export-limit.js';
import { validate } from '../../middlewares/validate.js';
import { createReportsService } from './service.js';

export function sendFile(
  res: Response,
  file: { buffer: Buffer; fileName: string; contentType: string },
) {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.fileName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
}

export function reportsRouter(deps: AppDeps): Router {
  const service = createReportsService(deps.db);
  const router = Router();
  const canRead = authorize(deps.db, 'report.read');
  const canExport = authorize(deps.db, 'report.export');
  const limitExport = exportLimiter();

  const kinds = {
    individual: individualReportQuerySchema,
    unit: unitReportQuerySchema,
    agency: agencyReportQuerySchema,
    aggregate: aggregateReportQuerySchema,
  } as const;

  for (const [kind, schema] of Object.entries(kinds) as [keyof typeof kinds, z.ZodObject][]) {
    router.get(`/${kind}`, canRead, validate({ query: schema }), async (req, res) => {
      const q = validQuery<never>(req);
      sendData(res, await service.view[kind](requireAuth(req), 'report.read', q));
    });
    router.get(
      `/${kind}/export`,
      canExport,
      limitExport,
      validate({ query: schema.extend(exportFormatSchema.shape) }),
      async (req, res) => {
        const { format, ...params } = validQuery<
          { format: ExportFormat } & Record<string, unknown>
        >(req);
        sendFile(
          res,
          await service.export(requireAuth(req), kind, params as never, format, actorOf(req)),
        );
      },
    );
  }
  return router;
}
