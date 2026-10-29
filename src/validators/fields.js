const { z } = require('zod');

/** Builds a zod object from a declarative field list used by both forms and validation. */
function isHttpUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function fieldSchema(f) {
  const label = f.label || f.name;
  switch (f.type) {
    case 'text': {
      let s = z.string().trim().max(f.max || 200, `${label} is too long`);
      return f.required ? s.min(1, `${label} is required`) : s.default('');
    }
    case 'textarea': {
      let s = z.string().trim().max(f.max || 5000, `${label} is too long`);
      return f.required ? s.min(1, `${label} is required`) : s.default('');
    }
    case 'url': {
      const s = z.string().trim().max(500, `${label} is too long`).default('')
        .refine((v) => v === '' || isHttpUrl(v), `${label} must start with http:// or https://`);
      return f.required ? s.refine((v) => v !== '', `${label} is required`) : s;
    }
    case 'number':
      return z.coerce.number({ invalid_type_error: `${label} must be a number` }).int().min(0).max(100000).default(0);
    case 'checkbox':
      return z.preprocess((v) => (Array.isArray(v) ? v.includes('on') : v === 'on' || v === 'true' || v === true), z.boolean());
    case 'select':
      return z.enum(f.options.map((o) => o.value), { errorMap: () => ({ message: `Choose a valid ${label.toLowerCase()}` }) });
    case 'csv':
      return z.preprocess(
        (v) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : []),
        z.array(z.string().max(40)).max(30, 'Too many items'),
      );
    case 'media':
      return z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().nullable());
    case 'mediamulti':
      return z.preprocess(
        (v) => (v == null || v === '' ? [] : (Array.isArray(v) ? v : [v]).map(Number)),
        z.array(z.number().int().positive()).max(30),
      );
    default:
      throw new Error(`Unknown field type ${f.type}`);
  }
}

function buildSchema(fields) {
  const shape = {};
  for (const f of fields) shape[f.name] = fieldSchema(f);
  return z.object(shape);
}

/** Returns { data } or { errors: {field: message} }. Unknown body keys are dropped. */
function parseFields(schema, body) {
  const result = schema.safeParse(body || {});
  if (result.success) return { data: result.data };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}

module.exports = { buildSchema, parseFields, isHttpUrl };
