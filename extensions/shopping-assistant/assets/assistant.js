const response = await fetch("/apps/assistant", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    query,
    messages,
    test: true,
  }),
});