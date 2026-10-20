// API stub for the flow harness. The real module reads `import.meta.env`
// (Vite-only) and talks to the backend; the harness replaces the request
// handler so it can count and inspect calls instead.
let handler = async () => {
  throw new Error("apiStub: no request handler configured");
};

let calls = [];

export const setRequestHandler = (fn) => {
  handler = fn;
};

export const resetApiStub = () => {
  calls = [];
  handler = async () => {
    throw new Error("apiStub: no request handler configured");
  };
};

export const getApiCalls = () => calls;

export const useApi = () => ({
  request: async (endpoint, method = "GET", body = null) => {
    calls.push({ endpoint, method, body });
    return handler(endpoint, method, body);
  },
});

export default useApi;
