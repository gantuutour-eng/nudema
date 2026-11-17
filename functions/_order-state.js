// Both spellings already exist in production. Read them as one business state;
// do not rewrite historical records or invent stricter fulfilment transitions.
export function isCancelled(status) {
  return status === 'cancel' || status === 'cancelled';
}
