import Antigravity from './components/Antigravity';
import CircularText from './components/CircularText';
import './App.css';

import cristal from './assets/media/cristal.mp4';
import eye from './assets/media/eye.mp4';
import tulip from './assets/media/tulip.mp4';
import fede from './assets/media/fede.mp4';

const mediaItems = [
  { src: cristal, blendMode: 'screen' },
  { src: eye, blendMode: 'screen' },
  { src: tulip, blendMode: 'screen' },
  { src: fede, blendMode: 'screen', scale: 1.4 }
];

function App() {
  return (
    <div className="app">
      <div className="antigravity-stage">
        <div className="hero-title-wrap">
          <CircularText
            text="DESIGN / MOTION / BRAND * DESIGN / MOTION / BRAND * "
            onHover="speedUp"
            spinDuration={20}
          />
        </div>
        <Antigravity
          images={mediaItems}
          count={mediaItems.length}
          magnetRadius={50}
          ringRadius={12}
          waveSpeed={0.4}
          waveAmplitude={1}
          lerpSpeed={0.1}
          color="#ffffff"
          autoAnimate={true}
          particleVariance={1}
          fieldStrength={10}
        />
      </div>
    </div>
  );
}

export default App;
