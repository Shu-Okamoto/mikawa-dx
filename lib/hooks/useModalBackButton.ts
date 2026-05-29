'use client'

import { useEffect, useRef } from 'react'

/**
 * モーダル等のオーバーレイ表示中にブラウザ「戻る」を押されたとき、
 * ページ遷移ではなくオーバーレイのクローズで吸収するためのフック。
 *
 * 使い方:
 *   const closeModal = useModalBackButton(isOpen, () => setOpen(false))
 *   // UIの閉じるボタン側からは setOpen(false) ではなく closeModal() を呼ぶ
 */
export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return
    window.history.pushState({ __modal: true }, '')

    const onPop = () => onCloseRef.current()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [isOpen])

  return function closeFromUi() {
    if (typeof window !== 'undefined' && window.history.state?.__modal) {
      window.history.back()
    } else {
      onCloseRef.current()
    }
  }
}
