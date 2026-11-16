import { error } from '../../_lib.js';
// Old password credentials and signed cookies no longer grant administrator access.
export function onRequestPost() {
  return error('Google бүртгэлээр нэвтэрнэ үү.', 410);
}
