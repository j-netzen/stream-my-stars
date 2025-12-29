import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "next-themes";
import { TVModeProvider } from "@/hooks/useTVMode";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MainLayout } from "@/components/layout/MainLayout";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import MoviesPage from "./pages/MoviesPage";
import TVShowsPage from "./pages/TVShowsPage";
import HomeMoviesPage from "./pages/HomeMoviesPage";
import CategoriesPage from "./pages/CategoriesPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import DiscoverPage from "./pages/DiscoverPage";
import SettingsPage from "./pages/SettingsPage";
import LiveTVPage from "./pages/LiveTVPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TVModeProvider>
        <AuthProvider>
          <TooltipProvider>
          <Toaster />
          <Sonner />
          <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route
                path="/"
                element={
                  <MainLayout>
                    <HomePage />
                  </MainLayout>
                }
              />
              <Route
                path="/movies"
                element={
                  <MainLayout>
                    <MoviesPage />
                  </MainLayout>
                }
              />
              <Route
                path="/tv-shows"
                element={
                  <MainLayout>
                    <TVShowsPage />
                  </MainLayout>
                }
              />
              <Route
                path="/home-movies"
                element={
                  <MainLayout>
                    <HomeMoviesPage />
                  </MainLayout>
                }
              />
              <Route
                path="/categories"
                element={
                  <MainLayout>
                    <CategoriesPage />
                  </MainLayout>
                }
              />
              <Route
                path="/playlists"
                element={
                  <MainLayout>
                    <PlaylistsPage />
                  </MainLayout>
                }
              />
              <Route
                path="/discover"
                element={
                  <MainLayout>
                    <DiscoverPage />
                  </MainLayout>
                }
              />
              <Route
                path="/settings"
                element={
                  <MainLayout>
                    <SettingsPage />
                  </MainLayout>
                }
              />
              <Route
                path="/live-tv"
                element={
                  <MainLayout>
                    <LiveTVPage />
                  </MainLayout>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </ErrorBoundary>
          </TooltipProvider>
        </AuthProvider>
      </TVModeProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
