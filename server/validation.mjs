export const invalidInput = (message) => Object.assign(new Error(message), { status: 400 });
export function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidInput('Request body must be a JSON object.');
  return value;
}
export function jsonObjectBody(req, _res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!req.is('application/json'))
      return next(
        Object.assign(new Error('Content-Type must be application/json.'), { status: 415 }),
      );
    requireObject(req.body);
  }
  next();
}
export function validText(value, max) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
export function optionalBoolean(body, key) {
  if (body[key] !== undefined && typeof body[key] !== 'boolean')
    throw invalidInput(`${key} must be true or false.`);
}
export function optionalRole(body) {
  if (
    body.role !== undefined &&
    (typeof body.role !== 'string' || !/^[a-z][a-z0-9_-]{1,30}$/.test(body.role))
  )
    throw invalidInput('Invalid role name.');
}
