import { lazy } from "react";
import { createRoutesFromElements, Navigate, Route } from "react-router-dom";
import App from "./App";
import Home from "./pages/Home"
import Landing from './pages/Landing'
import Profile from './pages/Profile'
import Revision from './pages/Revision'
import Courses from './pages/Courses'
import ImportCourse from './pages/ImportCourse' ;

// Secondary tools load on demand.
const Plan = lazy(() => import('./pages/Plan'))
const Chat = lazy(() => import('./pages/Chat'))
const Quiz = lazy(() => import('./pages/Quiz'))
const Tools = lazy(() => import('./pages/Tools'))
const ExamLabs = lazy(() => import('./pages/examlab.tsx'))
const NotFound = lazy(() => import('./pages/404.tsx'))
const PlannerPage = lazy(() => import('./pages/Planner'))
const Debate = lazy(() => import('./pages/Debate'))

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
    <Route path="me" element={<Profile key="moi" />} />
    {['profil', 'examens', 'matieres', 'emploi-du-temps', 'rythme'].map(page => <Route key={page} path={`me/${page}`} element={<Profile key={page} />} />)}
    <Route path="plan" element={<Plan />} />
    <Route path="revision" element={<Revision />} />
    <Route path="courses" element={<Courses />} />
    <Route path="import" element={<ImportCourse />} />
    <Route path="exam" element={<ExamLabs />} />
  </Route>
);
