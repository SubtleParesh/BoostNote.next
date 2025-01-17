import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SerializedDocWithBookmark,
  SerializedDoc,
} from '../../../interfaces/db/doc'
import DocLimitReachedBanner from '../../molecules/Banner/SubLimitReachedBanner'
import styled from '../../../lib/styled'
import { useNav } from '../../../lib/stores/nav'
import { SerializedTeam } from '../../../interfaces/db/team'
import { usePage } from '../../../lib/stores/pageStore'
import { usePreferences } from '../../../lib/stores/preferences'
import Application from '../../Application'
import { rightSideTopBarHeight } from '../RightSideTopBar/styled'
import { rightSidePageLayout } from '../../../lib/styled/styleFunctions'
import { SerializedUser } from '../../../interfaces/db/user'
import MarkdownView, { SelectionContext } from '../../atoms/MarkdownView'
import DocContextMenu from '../../organisms/Topbar/Controls/ControlsContextMenu/DocContextMenu'
import { useRouter } from '../../../lib/router'
import { LoadingButton } from '../../../../shared/components/atoms/Button'
import {
  mdiCommentTextOutline,
  mdiDotsHorizontal,
  mdiFormatListBulleted,
  mdiStar,
  mdiStarOutline,
} from '@mdi/js'
import { useCloudApi } from '../../../lib/hooks/useCloudApi'
import { useCloudResourceModals } from '../../../lib/hooks/useCloudResourceModals'
import { mapTopbarBreadcrumbs } from '../../../lib/mappers/topbarBreadcrumbs'
import useRealtime from '../../../lib/editor/hooks/useRealtime'
import { buildIconUrl } from '../../../api/files'
import { getColorFromString } from '../../../lib/utils/string'
import {
  createAbsolutePositionFromRelativePosition,
  createRelativePositionFromTypeIndex,
} from 'yjs'
import useCommentManagerState from '../../../../shared/lib/hooks/useCommentManagerState'
import { HighlightRange } from '../../../lib/rehypeHighlight'
import Spinner from '../../../../shared/components/atoms/Spinner'
import Icon from '../../../../shared/components/atoms/Icon'
import PresenceIcons from '../Topbar/PresenceIcons'
import { useDocActionContextMenu } from '../../molecules/Editor/useDocActionContextMenu'
import CommentManager from '../CommentManager'
import { SerializedRevision } from '../../../interfaces/db/revision'
import { TopbarControlProps } from '../../../../shared/components/organisms/Topbar'
import { getDocLinkHref } from '../../atoms/Link/DocLink'

interface ViewPageProps {
  team: SerializedTeam
  doc: SerializedDocWithBookmark
  editable: boolean
  user: SerializedUser
  contributors: SerializedUser[]
  backLinks: SerializedDoc[]
  revisionHistory: SerializedRevision[]
}

const ViewPage = ({
  doc,
  editable,
  team,
  contributors,
  backLinks,
  user,
  revisionHistory,
}: ViewPageProps) => {
  const { preferences, setPreferences } = usePreferences()
  const { foldersMap, workspacesMap, loadDoc } = useNav()
  const { push } = useRouter()
  const { currentUserIsCoreMember, permissions } = usePage()
  const { sendingMap, toggleDocBookmark } = useCloudApi()
  const {
    openRenameDocForm,
    openRenameFolderForm,
    openWorkspaceEditForm,
    openNewDocForm,
    openNewFolderForm,
    deleteDoc,
    deleteFolder,
    deleteWorkspace,
  } = useCloudResourceModals()
  const initialRenderDone = useRef(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const [realtimeContent, setRealtimeContent] = useState('')
  const [color] = useState(() => getColorFromString(user.id))
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  const userInfo = useMemo(() => {
    return {
      id: user.id,
      name: user.displayName,
      color: color,
      icon: user.icon != null ? buildIconUrl(user.icon.location) : undefined,
    }
  }, [user, color])

  const [realtime, connState, connectedUsers] = useRealtime({
    token: doc.collaborationToken || doc.id,
    id: doc.id,
    userInfo,
  })

  const otherUsers = useMemo(() => {
    return connectedUsers.filter((pUser) => pUser.id !== user.id)
  }, [connectedUsers, user])

  const onRender = useRef(() => {
    if (!initialRenderDone.current && window.location.hash) {
      const ele = document.getElementById(window.location.hash.substr(1))
      if (ele != null) {
        ele.scrollIntoView(true)
      }
      initialRenderDone.current = true
    }
  })

  const [commentState, commentActions] = useCommentManagerState(doc.id)

  const normalizedCommentState = useMemo(() => {
    if (commentState.mode === 'list_loading' || permissions == null) {
      return commentState
    }

    const normalizedState = { ...commentState }

    const updatedUsers = new Map(
      permissions.map((permission) => [permission.user.id, permission.user])
    )

    normalizedState.threads = normalizedState.threads.map((thread) => {
      if (thread.status.by == null) {
        return thread
      }
      const normalizedUser =
        updatedUsers.get(thread.status.by.id) || thread.status.by

      return { ...thread, status: { ...thread.status, by: normalizedUser } }
    })

    if (normalizedState.mode === 'thread') {
      if (normalizedState.thread.status.by != null) {
        const normalizedUser =
          updatedUsers.get(normalizedState.thread.status.by.id) ||
          normalizedState.thread.status.by
        normalizedState.thread = {
          ...normalizedState.thread,
          status: { ...normalizedState.thread.status, by: normalizedUser },
        }
      }

      normalizedState.comments = normalizedState.comments.map((comment) => {
        const normalizedUser = updatedUsers.get(comment.user.id) || comment.user
        return { ...comment, user: normalizedUser }
      })
    }

    return normalizedState
  }, [commentState, permissions])

  const newRangeThread = useCallback(
    (selection: SelectionContext) => {
      if (realtime == null) {
        return
      }
      const text = realtime.doc.getText('content')
      const anchor = createRelativePositionFromTypeIndex(text, selection.start)
      const head = createRelativePositionFromTypeIndex(text, selection.end)
      setPreferences({ docContextMode: 'comment' })
      commentActions.setMode({
        mode: 'new_thread',
        context: selection.text,
        selection: {
          anchor,
          head,
        },
      })
    },
    [realtime, commentActions, setPreferences]
  )

  const [viewComments, setViewComments] = useState<HighlightRange[]>([])
  const calculatePositions = useCallback(() => {
    if (commentState.mode === 'list_loading' || realtime == null) {
      return
    }

    const comments: HighlightRange[] = []
    for (const thread of commentState.threads) {
      if (thread.selection != null && thread.status.type !== 'outdated') {
        const absoluteAnchor = createAbsolutePositionFromRelativePosition(
          thread.selection.anchor,
          realtime.doc
        )
        const absoluteHead = createAbsolutePositionFromRelativePosition(
          thread.selection.head,
          realtime.doc
        )

        if (
          absoluteAnchor != null &&
          absoluteHead != null &&
          absoluteAnchor.index !== absoluteHead.index
        ) {
          if (thread.status.type === 'open') {
            comments.push({
              id: thread.id,
              start: absoluteAnchor.index,
              end: absoluteHead.index,
              active:
                commentState.mode === 'thread' &&
                thread.id === commentState.thread.id,
            })
          }
        } else if (connState === 'synced') {
          commentActions.threadOutdated(thread)
        }
      }
    }
    setViewComments(comments)
  }, [commentState, realtime, commentActions, connState])

  useEffect(() => {
    calculatePositions()
  }, [calculatePositions])

  const updateContent = useCallback(() => {
    if (realtime == null) {
      return
    }
    setRealtimeContent(realtime.doc.getText('content').toString())
  }, [realtime])

  useEffect(() => {
    updateContent()
  }, [updateContent])

  useEffect(() => {
    if (realtime != null) {
      realtime.doc.on('update', () => {
        calculatePositions()
        updateContent()
      })
      return () =>
        realtime.doc.off('update', () => {
          calculatePositions
          updateContent()
        })
    }
    return undefined
  }, [realtime, calculatePositions, updateContent])

  const commentClick = useCallback(
    (ids: string[]) => {
      if (commentState.mode !== 'list_loading') {
        const idSet = new Set(ids)
        setPreferences({ docContextMode: 'comment' })
        commentActions.setMode({
          mode: 'list',
          filter: (thread) => idSet.has(thread.id),
        })
      }
    },
    [commentState, commentActions, setPreferences]
  )

  const toggleBookmarkForDoc = useCallback(() => {
    toggleDocBookmark(doc.teamId, doc.id, doc.bookmarked)
  }, [toggleDocBookmark, doc.teamId, doc.id, doc.bookmarked])

  const { open: openDocActionContextMenu } = useDocActionContextMenu({
    doc,
    team,
    currentUserIsCoreMember,
    toggleBookmarkForDoc,
  })

  useEffect(() => {
    if (connState === 'synced' || connState === 'loaded') {
      setInitialLoadDone(true)
    }
  }, [connState])

  const getEmbed = useCallback(
    async (id: string) => {
      if (team == null) {
        return undefined
      }
      const doc = await loadDoc(id, team.id)
      if (doc == null) {
        return undefined
      }
      const current = `${location.protocol}//${location.host}`
      const link = `${current}${getDocLinkHref(doc, team, 'index')}`
      return {
        title: doc.title,
        content: doc.head != null ? doc.head.content : '',
        link,
      }
    },
    [loadDoc, team]
  )
  if (!initialLoadDone) {
    return (
      <Application content={{}}>
        <StyledLoadingView>
          <h3>Loading..</h3>
          <span>
            <Spinner />
          </span>
        </StyledLoadingView>
      </Application>
    )
  }

  return (
    <Application
      content={{
        reduced: true,
        topbar: {
          breadcrumbs: currentUserIsCoreMember
            ? mapTopbarBreadcrumbs(
                team,
                foldersMap,
                workspacesMap,
                push,
                { pageDoc: doc },
                openRenameFolderForm,
                openRenameDocForm,
                openNewDocForm,
                openNewFolderForm,
                openWorkspaceEditForm,
                deleteDoc,
                deleteFolder,
                deleteWorkspace
              )
            : mapTopbarBreadcrumbs(team, foldersMap, workspacesMap, push, {
                pageDoc: doc,
              }),
          children: (
            <StyledTopbarChildrenContainer>
              <LoadingButton
                variant='icon'
                disabled={sendingMap.has(doc.id)}
                spinning={sendingMap.has(doc.id)}
                size='sm'
                iconPath={doc.bookmarked ? mdiStar : mdiStarOutline}
                onClick={() =>
                  toggleDocBookmark(doc.teamId, doc.id, doc.bookmarked)
                }
              />
              <PresenceIcons user={userInfo} users={otherUsers} />
            </StyledTopbarChildrenContainer>
          ),
          controls: [
            {
              type: 'separator',
            },
            ...(connState === 'reconnecting'
              ? [
                  {
                    type: 'button',
                    variant: 'secondary' as const,
                    disabled: true,
                    label: 'Connecting...',
                    tooltip: (
                      <>
                        Attempting auto-reconnection
                        <br />
                        Changes will not be synced with the server until
                        reconnection
                      </>
                    ),
                  },
                ]
              : connState === 'disconnected'
              ? [
                  {
                    type: 'button',
                    variant: 'warning' as const,
                    onClick: () => realtime.connect(),
                    label: 'Reconnect',
                    tooltip: (
                      <>
                        Please try reconnecting.
                        <br />
                        Changes will not be synced with the server until
                        reconnection
                      </>
                    ),
                  },
                ]
              : connState === 'loaded'
              ? [
                  {
                    type: 'button',
                    variant: 'secondary' as const,
                    disabled: true,
                    label: 'Syncing...',
                    tooltip: (
                      <>
                        Syncing with the cloud.
                        <br />
                        Checking for changes and live updating the document
                      </>
                    ),
                  },
                ]
              : []),
            {
              type: 'button',
              variant: 'icon',
              iconPath: mdiDotsHorizontal,
              onClick: openDocActionContextMenu,
            },
            {
              type: 'button',
              variant: 'icon',
              iconPath: mdiCommentTextOutline,
              active: preferences.docContextMode === 'comment',
              onClick: () =>
                setPreferences(({ docContextMode }) => ({
                  docContextMode:
                    docContextMode === 'comment' ? 'hidden' : 'comment',
                })),
            },
            {
              variant: 'icon',
              iconPath: mdiFormatListBulleted,
              active: preferences.docContextMode === 'context',
              onClick: () =>
                setPreferences(({ docContextMode }) => ({
                  docContextMode:
                    docContextMode === 'context' ? 'hidden' : 'context',
                })),
            },
          ] as TopbarControlProps[],
        },
        right:
          preferences.docContextMode === 'context' ? (
            <DocContextMenu
              currentDoc={doc}
              contributors={contributors}
              backLinks={backLinks}
              team={team}
              revisionHistory={revisionHistory}
            />
          ) : preferences.docContextMode === 'comment' ? (
            <CommentManager
              state={normalizedCommentState}
              user={user}
              {...commentActions}
            />
          ) : null,
      }}
    >
      <Container>
        <div className='view__wrapper'>
          <div className='view__content'>
            {!editable && <DocLimitReachedBanner />}
            {realtimeContent !== '' ? (
              <MarkdownView
                content={realtimeContent}
                headerLinks={true}
                onRender={onRender.current}
                getEmbed={getEmbed}
                className='scroller'
                scrollerRef={previewRef}
                comments={viewComments}
                commentClick={commentClick}
                SelectionMenu={({ selection }) => (
                  <StyledSelectionMenu>
                    <div onClick={() => newRangeThread(selection)}>
                      <Icon size={34} path={mdiCommentTextOutline} />
                    </div>
                  </StyledSelectionMenu>
                )}
              />
            ) : (
              <>
                <StyledPlaceholderContent>
                  The document is empty
                </StyledPlaceholderContent>
              </>
            )}
          </div>
        </div>
      </Container>
    </Application>
  )
}

const StyledTopbarChildrenContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`

const StyledLoadingView = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  text-align: center;
  & span {
    width: 100%;
    height: 38px;
    position: relative;
  }
`

const StyledSelectionMenu = styled.div`
  display: flex;
  padding: 8px;
  max-height: 50px;
  cursor: pointer;
`

const StyledPlaceholderContent = styled.div`
  color: ${({ theme }) => theme.subtleTextColor};
`

const Container = styled.div`
  margin: 0;
  padding: 0;
  padding-top: ${rightSideTopBarHeight}px;
  min-height: calc(100vh - ${rightSideTopBarHeight}px);
  height: auto;
  display: flex;

  .cm-link {
    text-decoration: none;
  }

  .view__wrapper {
    display: flex;
    justify-content: center;
    flex-grow: 1;
    position: relative;
    top: 0;
    bottom: 0px;
    width: 100%;
    height: auto;
    min-height: calc(
      100vh - ${rightSideTopBarHeight}px -
        ${({ theme }) => theme.space.xlarge}px
    );
    font-size: 15px;
    ${rightSidePageLayout}
    margin: auto;
    padding: 0 ${({ theme }) => theme.space.xlarge}px;
  }

  &.view__content {
    height: 100%;
    width: 50%;
    padding-top: ${({ theme }) => theme.space.small}px;
    margin: 0 auto;
    width: 100%;

    & .inline-comment.active,
    .inline-comment.hv-active {
      background-color: rgba(112, 84, 0, 0.8);
    }
  }
`

export default ViewPage
