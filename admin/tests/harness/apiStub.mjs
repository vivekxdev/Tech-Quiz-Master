// API stub for the admin experience harness.
//
// It mirrors the shape of src/services/api/api.js ({ useApi } -> request),
// so the harness server can alias the real module to this file and the test
// can inspect every call. Kept inside the admin tree so Vite serves it when
// the harness server is rooted at admin/.
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
