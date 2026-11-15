/** A consistent inline error box. The message is always pre-normalised. */
export default function ErrorNotice({
  message,
  className = '',
}: {
  message: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}
    >
      {message}
    </div>
  )
}
