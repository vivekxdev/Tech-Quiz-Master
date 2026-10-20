import { useNavigate } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'

function ClerkProviderWithRouter({ children }) {
  const navigate = useNavigate()

  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      navigate={(to) => navigate(to)}
    >
      {children}
    </ClerkProvider>
  )
}

export default ClerkProviderWithRouter
