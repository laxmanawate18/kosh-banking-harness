import React, { useRef } from 'react';
import { Editorial, LuxHero, Rewards, SafetyStatement, UpgradeRail } from './Lux';
import { CardFan, Dust, FinaleCard, Torch, TravelingCard } from './Journey';
import { DoorFinale, Leaflet, Manifesto, Stats } from './Story';

interface HomeProps {
  onLogin: () => void;
  onAsk: (prompt: string) => void;
}

/** One idea per screen. Catalogue, rates and calculators live on their own pages. */
export const HomePage: React.FC<HomeProps> = ({ onLogin, onAsk }) => {
  const openAccount = () => { window.location.hash = '#/products/savings'; };
  const root = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={root} className="kj-home">
        <LuxHero onOpen={openAccount} onLogin={onLogin} />
        <Manifesto />
        <CardFan />
        <UpgradeRail onAsk={onAsk} />
        <Editorial />
        <Rewards />
        <SafetyStatement />
        <Stats />
        <Leaflet />
        <DoorFinale onOpen={openAccount} onAsk={onAsk}><FinaleCard /></DoorFinale>
      </div>
      <TravelingCard />
      <Torch />
      <Dust />
    </>
  );
};
