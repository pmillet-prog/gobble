import AvatarPreview from "./avatar/AvatarPreview.jsx";

const appStyles = `
  :root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #eef3f8;
    color: #162032;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
  }

  button,
  input,
  select {
    font: inherit;
  }

  .avatar-lab-app {
    min-height: 100vh;
    padding: 28px;
  }

  .avatar-lab-shell {
    width: min(1120px, 100%);
    margin: 0 auto;
  }

  .avatar-lab-header {
    margin-bottom: 18px;
  }

  .avatar-lab-title {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2.4rem);
    line-height: 1.05;
  }

  .avatar-lab-subtitle {
    max-width: 680px;
    margin: 8px 0 0;
    color: #5c6a7d;
    font-size: 0.96rem;
    line-height: 1.5;
  }

  @media (max-width: 720px) {
    .avatar-lab-app {
      padding: 16px;
    }
  }
`;

export default function App() {
  return (
    <main className="avatar-lab-app">
      <style>{appStyles}</style>
      <div className="avatar-lab-shell">
        <header className="avatar-lab-header">
          <h1 className="avatar-lab-title">Gobble Avatar Lab</h1>
          <p className="avatar-lab-subtitle">
            Laboratoire React/Vite pour un avatar SVG modulaire, anime et personnalisable.
          </p>
        </header>
        <AvatarPreview />
      </div>
    </main>
  );
}
