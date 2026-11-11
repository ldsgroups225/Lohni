import { lazy } from "react";
import { createRoutesFromElements, Navigate, Route } from "react-router-dom";
import App from "./App";
import Home from "./pages/Home";

// Pages other than Home load on demand: a much smaller first download.
const Landing = lazy(() => import('./pages/Landing'))
const Chat = lazy(() => import('./pages/Chat'))
const Quiz = lazy(() => import('./pages/Quiz'))
const Tools = lazy(() => import('./pages/Tools'))
const Profile = lazy(() => import('./pages/Profile'))
const ExamLabs = lazy(() => import('./pages/examlab.tsx'))
const NotFound = lazy(() => import('./pages/404.tsx'))
const PlannerPage = lazy(() => import('./pages/Planner'))
const Debate = lazy(() => import('./pages/Debate'))
const Revision = lazy(() => import('./pages/Revision'))
const Courses = lazy(() => import('./pages/Courses'))
const ImportCourse = lazy(() => import('./pages/ImportCourse'))

export const routes = createRoutesFromElements(
  <Route path="/" element={<App />}>
    <Route path="*" element={<NotFound />} />
    <Route index element={<Home />} />
    <Route path="tutor" element={<Landing />} />
    <Route path="chat" element={<Chat />} />
    <Route path="quiz" element={<Quiz />} />
    <Route path="tools" element={<Tools />} />
    <Route path="planner" element={<PlannerPage />} />
    <Route path="debate" element={<Debate />} />
    <Route path="cards" element={<Navigate to="/courses" replace />} />
    <Route path="me" element={<Profile />} />
    <Route path="revision" element={<Revision />} />
    <Route path="courses" element={<Courses />} />
    <Route path="import" element={<ImportCourse />} />
    <Route path="exam" element={<ExamLabs />} />
  </Route>
);
