export async function api(path, { method = 'GET', body, token, admin, file } = {}) {
  const headers = {};
  if (token) headers['x-participant-token'] = token;
  if (admin) headers.Authorization = 'Bearer ' + admin;

  let payload;
  if (file) {
    const form = new FormData();
    form.append('file', file);
    payload = form; // let the browser set the multipart Content-Type with its boundary
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const API_BASE = import.meta.env.VITE_API_URL || '/api';
  const res = await fetch(API_BASE + path, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}
