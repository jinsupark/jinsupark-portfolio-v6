import { createFileRoute, redirect } from '@tanstack/react-router';
import { SHADER_TYPES } from '@/studio/shaders';
import ShaderPlayground from '@/studio/ShaderPlayground';

export const Route = createFileRoute('/shaders/$type')({
  beforeLoad: ({ params }) => {
    if (!SHADER_TYPES[params.type])
      throw redirect({
        to: '/projects',
        search: { tab: 'shaders' },
        replace: true,
      });
  },
  component: ShaderPage,
});

function ShaderPage() {
  const { type } = Route.useParams();
  return <ShaderPlayground key={type} type={SHADER_TYPES[type]} />;
}
