import { useLocation } from 'react-router-dom';
import styled from 'styled-components';
import p from '@/global_states/profile';
import { Profile as ProfileType } from '@/constants/user';
import getRandomCover from '@/utils/get_random_cover';
import { ReactNode, useEffect, useRef, useState } from 'react';
import parseSearch from '@/utils/parse_search';
import { Query } from '@/constants';
import useNavigate from '@/utils/use_navigate';
import Cover, { Shape } from '@/components/cover';
import Slider from '@/components/slider';
import Paper from './paper';
import Logo from './logo';

const REDIRECT_DURATION = 5000;
const NICKNAME_MAX_LENGTH = 10;
const DEFAULT_AVATAR = getRandomCover();
const Style = styled(Paper)`
  display: flex;
  flex-direction: column;
  gap: 20px;

  > .avatar {
    align-self: center;
  }

  > .text {
    text-align: center;
    font-size: 18px;
  }
`;

function Profile({ profile }: { profile: ProfileType }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = parseSearch<Query>(location.search);
      const redirect = query.redirect || '/';
      navigate({ path: redirect });
    }, REDIRECT_DURATION);
    return () => window.clearTimeout(timer);
  }, [location.search, navigate]);

  const startTimestampRef = useRef(Date.now());
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let timer: number;
    const countdown = () => {
      const c = Math.min(
        (Date.now() - startTimestampRef.current) / REDIRECT_DURATION,
        1,
      );
      setCurrent(c);

      if (c < 1) {
        timer = window.requestAnimationFrame(countdown);
      }
    };

    countdown();
    return () => window.cancelAnimationFrame(timer);
  }, []);

  return (
    <>
      <Logo />
      <Cover
        className="avatar"
        src={profile.avatar || DEFAULT_AVATAR}
        size={100}
        shape={Shape.CIRCLE}
      />
      <div className="text">
        🎉 欢迎回来,{' '}
        {profile.nickname.length > NICKNAME_MAX_LENGTH
          ? `${profile.nickname.slice(0, NICKNAME_MAX_LENGTH)}...`
          : profile.nickname}
      </div>
      <Slider current={current} />
    </>
  );
}

function UserPanel() {
  const profile = p.useState();

  let content: ReactNode = null;
  if (profile) {
    content = <Profile profile={profile} />;
  }

  return <Style>{content}</Style>;
}

export default UserPanel;
