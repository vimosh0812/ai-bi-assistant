// "use client"

// import { createClient } from "@/lib/supabase/client"
// import { useEffect, useState } from "react"

// interface RealtimeDataHook<T> {
//   data: T[]
//   loading: boolean
//   error: string | null
//   refetch: () => Promise<void>
// }

// export function useRealtimeData<T>(
//   table: string,
//   select = "*",
//   filter?: { column: string; value: any },
// ): RealtimeDataHook<T> {
//   const [data, setData] = useState<T[]>([])
//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState<string | null>(null)
//   const supabase = createClient()

//   const fetchData = async () => {
//     try {
//       setLoading(true)
//       setError(null)

//       let query = supabase.from(table).select(select)

//       if (filter) {
//         query = query.eq(filter.column, filter.value)
//       }

//       const { data: result, error: fetchError } = await query

//       if (fetchError) throw fetchError

//       console.log(`[v0] Fetched ${result?.length || 0} records from ${table}`)
//       setData((result as T[]) || [])
//     } catch (err) {
//       console.error(`[v0] Error fetching data from ${table}:`, err)
//       setError(err instanceof Error ? err.message : "An error occurred")
//     } finally {
//       setLoading(false)
//     }
//   }

//   const refetch = async () => {
//     await fetchData()
//   }

//   useEffect(() => {
//     fetchData()
//   }, [table, select, filter?.column, filter?.value])

//   useEffect(() => {
//     console.log(`[v0] Setting up real-time subscription for table: ${table}`)

//     const channel = supabase
//       .channel(`realtime-${table}`)
//       .on(
//         "postgres_changes",
//         {
//           event: "*",
//           schema: "public",
//           table: table,
//         },
//         (payload) => {
//           console.log(`[v0] Real-time change in ${table}:`, payload.eventType, payload)

//           switch (payload.eventType) {
//             case "INSERT":
//               if (payload.new) {
//                 setData((current) => {
//                   // Check if filter applies to new record
//                   if (filter && payload.new[filter.column] !== filter.value) {
//                     return current
//                   }
//                   // Avoid duplicates
//                   const exists = current.some((item: any) => item.id === payload.new.id)
//                   if (exists) return current
//                   return [...current, payload.new as T]
//                 })
//               }
//               break

//             case "UPDATE":
//               if (payload.new) {
//                 setData((current) =>
//                   current.map((item: any) => (item.id === payload.new.id ? (payload.new as T) : item)),
//                 )
//               }
//               break

//             case "DELETE":
//               if (payload.old) {
//                 setData((current) => current.filter((item: any) => item.id !== payload.old.id))
//               }
//               break
//           }
//         },
//       )
//       .subscribe()

//     return () => {
//       console.log(`[v0] Cleaning up subscription for ${table}`)
//       supabase.removeChannel(channel)
//     }
//   }, [table])

//   return { data, loading, error, refetch }
// }
