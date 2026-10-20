// Clerk stub for the flow harness: the real provider needs a publishable key
// and a network round trip, neither of which the harness has.
let isSignedIn = true;
let openSignInCalls = 0;

export const setSignedIn = (value) => {
  isSignedIn = Boolean(value);
};

export const getOpenSignInCalls = () => openSignInCalls;

export const resetClerkStub = () => {
  isSignedIn = true;
  openSignInCalls = 0;
};

export const useUser = () => ({
  isSignedIn,
  isLoaded: true,
  user: isSignedIn ? { id: "user_test" } : null,
});

export const useClerk = () => {
  return {
    openSignIn: () => {
      openSignInCalls += 1;
    },
    openSignOut: () => {},
  };
}

export const useAuth = () => ({
  getToken: async () => "test-token",
  isSignedIn,
  isLoaded: true,
});

export const ClerkProvider = ({ children }) => children;

export default { useUser, useClerk, useAuth, ClerkProvider };
