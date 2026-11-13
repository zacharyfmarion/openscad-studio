import {
  continueModelConversation,
  getVisionSupportForModelId,
  type ModelConversationHistory,
} from '../aiMessages';
import type { Message } from '../../types/aiChat';

const user: Message = {
  id: 'u1',
  timestamp: 1,
  type: 'user',
  parts: [{ type: 'text', text: 'First' }],
};
const assistant: Message = {
  id: 'a1',
  timestamp: 2,
  type: 'assistant',
  turnId: 'turn1',
  content: 'Answer',
  state: 'complete',
};
const nextUser: Message = {
  id: 'u2',
  timestamp: 3,
  type: 'user',
  parts: [{ type: 'text', text: 'Next' }],
};
const history: ModelConversationHistory = {
  context: 'same-model-system-and-account',
  displayMessages: [user, assistant],
  modelMessages: [
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: '', providerOptions: { anthropic: { signature: 'signature' } } },
      ],
    },
  ],
};

it.each([
  ['system changed', 'new-system', [user, assistant, nextUser]],
  ['earlier message edited', history.context, [{ ...user }, assistant, nextUser]],
  ['checkpoint restored', history.context, [user, nextUser]],
  ['transcript replaced', history.context, [nextUser]],
])('drops bound reasoning when %s', (_label, context, messages) => {
  expect(
    JSON.stringify(continueModelConversation(history, context as string, messages as Message[], {}))
  ).not.toContain('signature');
});

it('recognizes latest hosted models as vision-capable', () => {
  expect(getVisionSupportForModelId('gpt-6.1-sol')).toBe('yes');
  expect(getVisionSupportForModelId('claude-sonnet-5-5')).toBe('yes');
});
