/**
 * Socket.IO singleton + React helpers.
 *
 * Rooms are joined explicitly so a customer screen can only ever listen to the
 * table encoded in its QR code.
 */
import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { getToken } from './api'

let socket = null

export function connectSocket(token) {
  if (socket) {
    if (socket.connected) return socket
    socket.connect()
    return socket
  }
  socket = io('/', {
    auth: { token: token || getToken() || undefined },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
  })
  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

/**
 * Subscribe to a server event for the lifetime of the component.
 * Re-subscribes automatically after reconnects.
 */
export function useSocketEvent(event, handler) {
  const saved = useRef(handler)
  saved.current = handler

  useEffect(() => {
    const s = connectSocket(getToken())
    const listener = (payload) => saved.current && saved.current(payload)
    s.on(event, listener)
    const onReconnect = () => s.emit('rejoin')
    s.on('reconnect', onReconnect)
    return () => {
      s.off(event, listener)
      s.off('reconnect', onReconnect)
    }
  }, [event])
}

/** Join a room once connected (and again after every reconnect). */
export function useRoom(room, enabled = true) {
  const key = JSON.stringify(room || null)

  useEffect(() => {
    if (!enabled || !room) return
    const s = connectSocket(getToken())
    const join = () => s.emit('join', room)
    if (s.connected) join()
    s.on('connect', join)
    return () => {
      s.off('connect', join)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
}
