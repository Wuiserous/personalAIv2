import Sidebar from './components/Sidebar';
import ChatBox from './components/ChatBox';

export default function App() {
  return (
    <div className="flex h-full relative w-full">
      <Sidebar />
      <div className="flex-1 bg-white">
        <ChatBox />
      </div>
    </div>
  );
}