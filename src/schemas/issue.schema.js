const { z } = require("zod");

// Helper para convertir coordenadas regional español (coma) a punto
const parseCoordinate = (val) => {
  if (typeof val === "string") {
    const normalized = val.replace(",", ".");
    const n = parseFloat(normalized);
    return isNaN(n) ? undefined : n;
  }
  if (typeof val === "number") return val;
  return undefined;
};

// Esquema para la consulta (GET /v1/issues)
const getIssuesSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(10),
  status: z.string().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  order: z.enum(["new", "old", "cat", "status"]).optional().default("new"),
  sort: z.string().optional(), // legacy support
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mapId: z.coerce.number().optional(),
});

// Esquema para creación (POST /v1/issues)
const createIssueSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  category: z.string().trim().min(1, "Category is required"),
  description: z.string().trim().min(1, "Description is required"),
  lat: z.any().transform(parseCoordinate).pipe(
    z.number({ invalid_type_error: "Lat must be a number" }).min(-90).max(90)
  ),
  lng: z.any().transform(parseCoordinate).pipe(
    z.number({ invalid_type_error: "Lng must be a number" }).min(-180).max(180)
  ),
  map_id: z.coerce.number().optional()
});

// Esquema para actualización (PATCH /v1/issues/:id)
const updateIssueSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  map_id: z.coerce.number().optional(),
});

module.exports = {
  getIssuesSchema,
  createIssueSchema,
  updateIssueSchema,
};
