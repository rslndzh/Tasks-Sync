import { useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Layout } from "@/components/Layout"
import { LoginPage } from "@/pages/LoginPage"
import { SignupPage } from "@/pages/SignupPage"
import { TodayPage } from "@/pages/TodayPage"
import { BucketPage } from "@/pages/BucketPage"
import { TaskPage } from "@/pages/TaskPage"
import { useImportRuleStore } from "@/stores/useImportRuleStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { useBucketStore } from "@/stores/useBucketStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { useConnectionStore } from "@/stores/useConnectionStore"
import { useTodaySectionsStore } from "@/stores/useTodaySectionsStore"

export function App() {
  const initializeAuth = useAuthStore((s) => s.initialize)
  const loadBuckets = useBucketStore((s) => s.loadBuckets)
  const loadTasks = useTaskStore((s) => s.loadTasks)
  const loadConnections = useConnectionStore((s) => s.loadConnections)
  const loadRules = useImportRuleStore((s) => s.loadRules)
  const loadTodaySections = useTodaySectionsStore((s) => s.load)

  // Resolve auth state + load local data on app mount
  useEffect(() => {
    void initializeAuth()
    void loadBuckets()
    void loadTasks()
    void loadConnections()
    void loadRules()
    void loadTodaySections()
  }, [initializeAuth, loadBuckets, loadTasks, loadConnections, loadRules, loadTodaySections])

  return (
    <BrowserRouter>
      <TooltipProvider>
        <Routes>
          {/* Auth routes — users navigate here voluntarily to enable sync */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Main app routes — no auth required, works fully local */}
          <Route path="/" element={<Layout />}>
            {/* / — Today smart list (default landing page) */}
            <Route index element={<TodayPage />} />

            {/* /bucket/:bucketId — Single bucket view */}
            <Route path="bucket/:bucketId" element={<BucketPage />} />

            {/* /task/:taskId — Task detail view */}
            <Route path="task/:taskId" element={<TaskPage />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </TooltipProvider>
    </BrowserRouter>
  )
}
