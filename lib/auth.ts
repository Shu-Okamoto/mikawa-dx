import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

export interface AuthUser {
  userId   : number
  role     : string
  store    : string
  storeName: string
  category : string
  name     : string
}

export function verifyToken(req: NextRequest): AuthUser | null {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser
    return decoded
  } catch {
    return null
  }
}