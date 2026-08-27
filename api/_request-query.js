export function singleQueryValue(req, name) {
  try {
    const url = new URL(String(req?.url || '/'), 'https://dabbir.invalid');
    const values = url.searchParams.getAll(name);
    return values.length === 1 ? values[0] : null;
  } catch {
    return null;
  }
}
