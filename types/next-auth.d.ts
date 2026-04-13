import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id:           string
      employeeCode: string
      role:         string
    } & DefaultSession['user']
  }
  interface User {
    employeeCode: string
    role:         string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id:           string
    employeeCode: string
    role:         string
  }
}
