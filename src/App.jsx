import { Route, Routes } from 'react-router-dom';
import { Container } from '@mantine/core';
import Home from './pages/Home.jsx';
import Admin from './pages/Admin.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Container size="xs" py="xl">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Container>
  );
}
