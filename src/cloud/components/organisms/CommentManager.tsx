import React, { useMemo, useState } from 'react'
import { docContextWidth } from './Topbar/Controls/ControlsContextMenu/DocContextMenu'
import { Thread, Comment } from '../../interfaces/db/comments'
import Spinner from '../../../shared/components/atoms/Spinner'
import { mdiPlusBoxOutline, mdiArrowLeft } from '@mdi/js'
import Icon from '../../../shared/components/atoms/Icon'
import CommentList from '../molecules/CommentList'
import styled from '../../../shared/lib/styled'
import CommentInput from '../molecules/CommentInput'
import ThreadActionButton from '../molecules/ThreadActionButton'
import Button from '../../../shared/components/atoms/Button'
import { CreateThreadRequestBody } from '../../api/comments/thread'
import { SerializedUser } from '../../interfaces/db/user'
import ThreadList from '../molecules/ThreadList'
import ThreadStatusFilterControl, {
  StatusFilter,
} from '../atoms/ThreadStatusFilterControl'
import { partitionOnStatus } from '../../../shared/lib/utils/comments'

export type State =
  | { mode: 'list_loading' }
  | { mode: 'list'; threads: Thread[]; filter?: (thread: Thread) => boolean }
  | { mode: 'thread_loading'; thread: Thread; threads: Thread[] }
  | { mode: 'thread'; thread: Thread; comments: Comment[]; threads: Thread[] }
  | {
      mode: 'new_thread'
      data: { context?: Thread['context']; selection?: Thread['selection'] }
      threads: Thread[]
    }

export type ModeTransition =
  | { mode: 'thread'; thread: Thread }
  | { mode: 'list'; filter?: (thread: Thread) => boolean }
  | {
      mode: 'new_thread'
      context?: Thread['context']
      selection?: Thread['selection']
    }

export interface Actions {
  setMode: (transition: ModeTransition) => void
  createThread: (
    data: Omit<CreateThreadRequestBody, 'doc'>
  ) => Promise<Thread | Error>
  reopenThread: (thread: Thread) => Promise<Thread | Error>
  closeThread: (thread: Thread) => Promise<Thread | Error>
  deleteThread: (thread: Thread) => Promise<void | Error>
  threadOutdated: (thread: Thread) => Promise<Thread | Error>
  createComment: (thread: Thread, message: string) => Promise<void | Error>
  updateComment: (comment: Comment, message: string) => Promise<void | Error>
  deleteComment: (comment: Comment) => Promise<void | Error>
  user?: SerializedUser
}

interface CommentManagerProps extends Actions {
  state: State
}

function CommentManager({
  state,
  setMode,
  createThread,
  reopenThread,
  closeThread,
  deleteThread,
  createComment,
  updateComment,
  deleteComment,
  user,
}: CommentManagerProps) {
  const [statusFilter, setStatusFitler] = useState<StatusFilter>('open')
  const partitioned = useMemo(() => {
    return partitionOnStatus(state.mode === 'list_loading' ? [] : state.threads)
  }, [state])

  const counts = useMemo(() => {
    return {
      all: state.mode === 'list_loading' ? 0 : state.threads.length,
      open: partitioned.open.length,
      closed: partitioned.closed.length,
      outdated: partitioned.outdated.length,
    }
  }, [partitioned, state])

  const content = useMemo(() => {
    switch (state.mode) {
      case 'list_loading':
      case 'thread_loading':
        return (
          <div className='thread__loading'>
            <Spinner />
          </div>
        )
      case 'list': {
        const stateThreads =
          statusFilter === 'all' ? state.threads : partitioned[statusFilter]
        const threads =
          state.filter != null
            ? stateThreads.filter(state.filter)
            : stateThreads
        return (
          <>
            <ThreadList
              threads={threads}
              onSelect={(thread) => setMode({ mode: 'thread', thread })}
              onOpen={reopenThread}
              onClose={closeThread}
              onDelete={deleteThread}
            />
            <div
              className='thread__create'
              onClick={() => setMode({ mode: 'new_thread' })}
            >
              <Icon path={mdiPlusBoxOutline} /> <span>Create a new thread</span>
            </div>
          </>
        )
      }
      case 'thread': {
        return (
          <div className='thread__content'>
            <div>
              <div className='thread__context'>{state.thread.context}</div>
              <CommentList
                comments={state.comments}
                className='comment__list'
                updateComment={updateComment}
                deleteComment={deleteComment}
                user={user}
              />
              {state.thread.status.type === 'open' && (
                <CommentInput
                  onSubmit={(message) => createComment(state.thread, message)}
                  autoFocus={true}
                />
              )}
              {state.thread.status.type === 'closed' && (
                <Button
                  onClick={() => reopenThread(state.thread)}
                  variant='secondary'
                >
                  Reopen
                </Button>
              )}
            </div>
          </div>
        )
      }
      case 'new_thread': {
        return (
          <div className='thread__new'>
            <div className='thread__context'>{state.data.context}</div>
            <CommentInput
              onSubmit={async (comment) => {
                await createThread({ ...state.data, comment })
              }}
              autoFocus={true}
            />
          </div>
        )
      }
    }
  }, [
    state,
    createThread,
    reopenThread,
    closeThread,
    deleteThread,
    createComment,
    updateComment,
    deleteComment,
    setMode,
    user,
    statusFilter,
    partitioned,
  ])

  return (
    <Container>
      <div className='header'>
        {(state.mode !== 'list' || state.filter != null) && (
          <div
            className='icon__wrapper'
            onClick={() => setMode({ mode: 'list' })}
          >
            <Icon size={20} path={mdiArrowLeft} />
          </div>
        )}
        <h4>Thread</h4>
        {state.mode === 'list' && (
          <ThreadStatusFilterControl
            value={statusFilter}
            onChange={setStatusFitler}
            counts={counts}
          />
        )}
        {state.mode === 'thread' && (
          <ThreadActionButton
            thread={state.thread}
            onClose={closeThread}
            onOpen={reopenThread}
            onDelete={deleteThread}
          />
        )}
      </div>
      {content}
    </Container>
  )
}

const Container = styled.div`
  margin: auto;
  width: ${docContextWidth}px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-left: 1px solid ${({ theme }) => theme.colors.border.main};
  border-radius: 0px;
  background-color: ${({ theme }) => theme.colors.background.secondary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.sizes.fonts.md}px;
  position: relative;
  scrollbar-width: thin;
  &::-webkit-scrollbar {
    width: 6px;
  }

  .header {
    padding: 0px ${({ theme }) => theme.sizes.spaces.df}px;
    & h4 {
      margin: 0;
    }
    display: flex;
    align-items: center;
    height: 44px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.main};
    flex-shrink: 0;
    flex-grow: 0;

    h4 {
      flex-grow: 1;
      &:not(:first-child) {
        margin-left: ${({ theme }) => theme.sizes.spaces.sm}px;
      }
    }

    .icon__wrapper {
      height: 20px;
    }
  }

  .thread__content {
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column-reverse;
    scrollbar-width: thin;
    padding: 0px ${({ theme }) => theme.sizes.spaces.df}px;
    margin-bottom: ${({ theme }) => theme.sizes.spaces.df}px;
    & .comment__list {
      & > div {
        margin-bottom: ${({ theme }) => theme.sizes.spaces.df}px;
      }

      &:hover {
        .comment__meta__menu {
          display: block;
        }
      }
    }
  }

  .thread__context {
    margin: ${({ theme }) => theme.sizes.spaces.sm}px 0;
    white-space: pre-wrap;
    color: white;
    background-color: #705400;
  }

  .thread__create {
    display: flex;
    align-items: center;
    padding: 0px ${({ theme }) => theme.sizes.spaces.df}px;
    margin: ${({ theme }) => theme.sizes.spaces.df}px 0;
    cursor: default;
    color: ${({ theme }) => theme.colors.text.secondary};
    &:hover {
      color: ${({ theme }) => theme.colors.text.primary};
    }
    & > * {
      margin-right: ${({ theme }) => theme.sizes.spaces.xsm}px;
    }
  }

  .thread__new {
    padding: 0px ${({ theme }) => theme.sizes.spaces.df}px;
  }

  .thread__loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate3d(-50%, -50%, 0);
  }
`

export default CommentManager
