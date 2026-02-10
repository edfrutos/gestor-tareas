const { z } = require("zod");

// Helper para convertir coordenadas con coma (regional español) a punto
const coordinatePreprocessor = (val) => {
  if (typeof val === "string") {
    return parseFloat(val.replace(",", "."));
  }
  return Number(val);
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
});

// Esquema para creación (POST /v1/issues)
const createIssueSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  category: z.string().trim().min(1, "Category is required"),
  description: z.string().trim().min(1, "Description is required"),
  lat: z.preprocess(
    coordinatePreprocessor,
    z.number({ invalid_type_error: "Lat must be a number" })
  ),
  lng: z.preprocess(
    coordinatePreprocessor,
    z.number({ invalid_type_error: "Lng must be a number" })
  ),
});

// Esquema para actualización (PATCH /v1/issues/:id)
const updateIssueSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  // Nota: Multer maneja los archivos por separado, no los validamos aquí en el body
});

module.exports = {
  getIssuesSchema,
  createIssueSchema,
  updateIssueSchema,
};
