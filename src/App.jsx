import { Route, Routes } from 'react-router-dom';
import { Container } from '@mantine/core';
import Home from './pages/Home.jsx';
import Admin from './pages/Admin.jsx';
import Enter from './pages/Enter.jsx';
import MyFriend from './pages/MyFriend.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Container size="xs" py="xl">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/entrar/:token" element={<Enter />} />
        <Route path="/mi-amigo" element={<MyFriend />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Container>
  );
}
