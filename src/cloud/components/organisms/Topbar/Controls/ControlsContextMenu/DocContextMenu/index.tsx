import React, { useState, useCallback, useMemo, useRef } from 'react'
import { usePage } from '../../../../../../lib/stores/pageStore'
import { useNav } from '../../../../../../lib/stores/nav'
import {
  mdiTrashCan,
  mdiPlusBoxMultipleOutline,
  mdiHistory,
  mdiArchiveOutline,
  mdiArrowRight,
  mdiClockOutline,
  mdiLabelMultipleOutline,
  mdiAccountMultiplePlusOutline,
  mdiArrowBottomLeft,
  mdiPencil,
  mdiListStatus,
  mdiAccountCircleOutline,
  mdiAccountMultiple,
} from '@mdi/js'
import { zIndexModalsBackground } from '../styled'
import {
  SerializedDocWithBookmark,
  SerializedDoc,
  DocStatus,
} from '../../../../../../interfaces/db/doc'
import { getFormattedDateTime } from '../../../../../../lib/date'
import {
  isSingleKeyEvent,
  preventKeyboardEventPropagation,
  useGlobalKeyDownHandler,
} from '../../../../../../lib/keyboard'
import { saveDocAsTemplate } from '../../../../../../api/teams/docs/templates'
import { SerializedTeam } from '../../../../../../interfaces/db/team'
import {
  updateDocStatus,
  updateDocDueDate,
} from '../../../../../../api/teams/docs'
import RevisionsModal from '../../../../Modal/contents/Doc/RevisionsModal'
import { SerializedRevision } from '../../../../../../interfaces/db/revision'
import { MixpanelActionTrackTypes } from '../../../../../../interfaces/analytics/mixpanel'
import { trackEvent } from '../../../../../../api/track'
import { SerializedUser } from '../../../../../../interfaces/db/user'
import Flexbox from '../../../../../atoms/Flexbox'
import UserIcon from '../../../../../atoms/UserIcon'
import SmallButton from '../../../../../atoms/SmallButton'
import MoveItemModal from '../../../../Modal/contents/Forms/MoveItemModal'
import DocTagsList from '../../../../../molecules/DocTagsList'
import DocLink from '../../../../../atoms/Link/DocLink'
import { getDocTitle } from '../../../../../../lib/utils/patterns'
import { usePreferences } from '../../../../../../lib/stores/preferences'
import {
  focusFirstChildFromElement,
  isChildNode,
  navigateToNextFocusableWithin,
  navigateToPreviousFocusableWithin,
} from '../../../../../../lib/dom'
import cc from 'classcat'
import {
  linkText,
  topbarIconButtonStyle,
} from '../../../../../../lib/styled/styleFunctions'
import Icon from '../../../../../atoms/Icon'
import DocShare from '../../../../../molecules/DocShare'
import plur from 'plur'
import styled from '../../../../../../lib/styled'
import IconMdi from '../../../../../atoms/IconMdi'
import DynamicExports from './DynamicExports'
import GuestsModal from '../../../../Modal/contents/Doc/GuestsModal'
import Button from '../../../../../atoms/Button'
import { revisionHistoryStandardDays } from '../../../../../../lib/subscription'
import UpgradeButton from '../../../../../UpgradeButton'
import { useToast } from '../../../../../../../shared/lib/stores/toast'
import { useModal } from '../../../../../../../shared/lib/stores/modal'
import DocStatusSelect from './DocStatusSelect'
import DocDueDateSelect from './DocDueDateSelect'

interface DocContextMenuProps {
  currentDoc: SerializedDocWithBookmark
  contributors: SerializedUser[]
  backLinks: SerializedDoc[]
  revisionHistory?: SerializedRevision[]
  team: SerializedTeam
  editorRef?: React.MutableRefObject<CodeMirror.Editor | null>
  restoreRevision?: (revision: SerializedRevision) => void
  openRenameDocForm?: () => void
  sendingRename?: boolean
}

const DocContextMenu = ({
  team,
  currentDoc,
  contributors,
  backLinks,
  editorRef,
  revisionHistory,
  restoreRevision,
  openRenameDocForm,
  sendingRename,
}: DocContextMenuProps) => {
  const [sendingTemplate, setSendingTemplate] = useState(false)
  const [sendingUpdateStatus, setSendingUpdateStatus] = useState(false)
  const [sendingMove, setSendingMove] = useState(false)
  const [sendingDueDate, setSendingDueDate] = useState(false)
  const {
    updateDocsMap,
    deleteDocHandler,
    updateDocHandler,
    updateTemplatesMap,
  } = useNav()
  const {
    guestsMap,
    setPartialPageData,
    subscription,
    permissions = [],
    currentUserPermissions,
  } = usePage()
  const { pushMessage, pushApiErrorMessage } = useToast()
  const { openModal } = useModal()
  const [sliceContributors, setSliceContributors] = useState(true)
  const { preferences } = usePreferences()
  const menuRef = useRef<HTMLDivElement>(null)

  const usersMap = useMemo(() => {
    const users = permissions.reduce((acc, val) => {
      acc.set(val.user.id, val.user)
      return acc
    }, new Map<string, SerializedUser>())

    guestsMap.forEach((val) => users.set(val.user.id, val.user))
    return users
  }, [permissions, guestsMap])

  const guestsOnThisDoc = useMemo(() => {
    return [...guestsMap.values()].filter((guest) =>
      (guest.docsIds || []).includes(currentDoc.id)
    )
  }, [currentDoc, guestsMap])

  const contributorsState = useMemo(() => {
    let allContributors = contributors
    let sliced = 0
    if (sliceContributors && contributors.length > 5) {
      allContributors = contributors.slice(0, 5)
      sliced = contributors.length - 5
    }

    return {
      contributors: allContributors,
      sliced,
    }
  }, [contributors, sliceContributors])

  const toggleTemplate = useCallback(async () => {
    if (
      sendingTemplate ||
      sendingUpdateStatus ||
      sendingMove ||
      currentDoc == null
    ) {
      return
    }
    setSendingTemplate(true)
    try {
      const data = await saveDocAsTemplate(currentDoc.teamId, currentDoc.id)
      updateTemplatesMap([data.template.id, data.template])
    } catch (error) {
      pushMessage({
        title: 'Error',
        description: 'Could not handle the template change',
      })
    }
    setSendingTemplate(false)
  }, [
    currentDoc,
    setSendingTemplate,
    pushMessage,
    sendingTemplate,
    sendingUpdateStatus,
    sendingMove,
    updateTemplatesMap,
  ])

  const useContextMenuKeydownHandler = useMemo(() => {
    return (event: KeyboardEvent) => {
      if (
        menuRef.current != null &&
        isChildNode(menuRef.current, document.activeElement)
      ) {
        if (isSingleKeyEvent(event, 'arrowdown')) {
          if (!menuRef.current.contains(document.activeElement)) {
            focusFirstChildFromElement(menuRef.current as HTMLDivElement)
            return
          }

          navigateToNextFocusableWithin(menuRef.current, true)
          preventKeyboardEventPropagation(event)
          return
        }

        if (isSingleKeyEvent(event, 'arrowup')) {
          if (!menuRef.current.contains(document.activeElement)) {
            return
          }
          navigateToPreviousFocusableWithin(menuRef.current, true)
          preventKeyboardEventPropagation(event)
          return
        }
      }
    }
  }, [menuRef])
  useGlobalKeyDownHandler(useContextMenuKeydownHandler)

  const revisionNavigateCallback = useCallback(() => {
    openModal(
      <RevisionsModal
        currentDoc={currentDoc}
        restoreRevision={restoreRevision}
      />,
      {
        width: 'large',
      }
    )
    trackEvent(MixpanelActionTrackTypes.RevisionHistoryOpen, {
      docId: currentDoc.id,
    })
  }, [currentDoc, openModal, restoreRevision])

  const moveDoc = useCallback(
    async (
      doc: SerializedDocWithBookmark,
      workspaceId: string,
      parentFolderId?: string
    ) => {
      if (sendingTemplate || sendingUpdateStatus || sendingMove) {
        return
      }
      setSendingMove(true)
      try {
        await updateDocHandler(doc, { workspaceId, parentFolderId })
      } catch (error) {
        pushApiErrorMessage(error)
      }
      setSendingMove(false)
    },
    [
      updateDocHandler,
      pushApiErrorMessage,
      sendingTemplate,
      sendingUpdateStatus,
      sendingMove,
    ]
  )

  const openMoveForm = useCallback(
    (doc: SerializedDocWithBookmark) => {
      openModal(
        <MoveItemModal
          onSubmit={(workspaceId, parentFolderId) =>
            moveDoc(doc, workspaceId, parentFolderId)
          }
        />
      )
    },
    [openModal, moveDoc]
  )

  const sendUpdateStatus = useCallback(
    async (newStatus: DocStatus | null) => {
      if (currentDoc.status === newStatus) {
        return
      }
      if (
        sendingTemplate ||
        sendingUpdateStatus ||
        sendingMove ||
        currentDoc == null
      ) {
        return
      }

      setSendingUpdateStatus(true)
      try {
        const data = await updateDocStatus(
          currentDoc.teamId,
          currentDoc.id,
          newStatus
        )
        updateDocsMap([data.doc.id, data.doc])
        setPartialPageData({ pageDoc: data.doc })
      } catch (error) {
        pushMessage({
          title: 'Error',
          description: 'Could not archive this doc',
        })
      }
      setSendingUpdateStatus(false)
    },
    [
      currentDoc,
      pushMessage,
      sendingUpdateStatus,
      sendingMove,
      sendingTemplate,
      setPartialPageData,
      updateDocsMap,
    ]
  )

  const sendUpdateDocDueDate = useCallback(
    async (newDate: Date | null) => {
      if (
        sendingTemplate ||
        sendingUpdateStatus ||
        sendingMove ||
        currentDoc == null
      ) {
        return
      }

      setSendingDueDate(true)
      try {
        const data = await updateDocDueDate(
          currentDoc.teamId,
          currentDoc.id,
          newDate
        )
        updateDocsMap([data.doc.id, data.doc])
        setPartialPageData({ pageDoc: data.doc })
      } catch (error) {
        pushMessage({
          title: 'Error',
          description: 'Could not archive this doc',
        })
      }
      setSendingDueDate(false)
    },
    [
      currentDoc,
      pushMessage,
      sendingMove,
      sendingTemplate,
      sendingUpdateStatus,
      setPartialPageData,
      updateDocsMap,
    ]
  )

  const updating =
    sendingTemplate || sendingUpdateStatus || sendingMove || sendingDueDate

  return (
    <Container className={cc([!preferences.docContextIsHidden && 'active'])}>
      <div ref={menuRef} className='context__menu'>
        <div className='context__container'>
          <div className='context__scroll__container'>
            <div className='context__scroll'>
              <div className='context__row'>
                <div className='context__header'>DOC INFO</div>
              </div>
              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiAccountCircleOutline}
                    size={18}
                    className='context__icon'
                  />{' '}
                  Assignees
                </label>
                <div className='context__content'>
                  <span>
                    {currentDoc.assignees?.map((assignee) => {
                      return <li>{assignee.user?.uniqueName}</li>
                    })}
                  </span>
                </div>
              </div>

              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiListStatus}
                    size={18}
                    className='context__icon'
                  />{' '}
                  Status
                </label>
                <div className='context__content'>
                  <DocStatusSelect
                    status={currentDoc.status}
                    sending={sendingUpdateStatus}
                    onStatusChange={sendUpdateStatus}
                  />
                </div>
              </div>

              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiClockOutline}
                    size={18}
                    className='context__icon'
                  />{' '}
                  Due Date
                </label>
                <div className='context__content'>
                  <DocDueDateSelect
                    className='context__content__date_select'
                    sending={sendingDueDate}
                    dueDate={currentDoc.dueDate}
                    onDueDateChange={sendUpdateDocDueDate}
                  />
                </div>
              </div>

              <div className='context__break' />
              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiClockOutline}
                    size={18}
                    className='context__icon'
                  />{' '}
                  Creation Date
                </label>
                <div className='context__content'>
                  <span>
                    {getFormattedDateTime(
                      currentDoc.createdAt,
                      undefined,
                      'MMM dd, yyyy, HH:mm'
                    )}
                  </span>
                </div>
              </div>
              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiAccountCircleOutline}
                    size={18}
                    className='context__icon'
                  />{' '}
                  Updated by
                </label>
                <div className='context__content'>
                  <Flexbox wrap='wrap'>
                    {currentDoc.head != null ? (
                      (currentDoc.head.creators || []).length > 0 ? (
                        <>
                          {(currentDoc.head.creators || []).map((user) => (
                            <UserIcon
                              key={user.id}
                              user={usersMap.get(user.id) || user}
                              className='subtle'
                            />
                          ))}
                        </>
                      ) : (
                        ''
                      )
                    ) : (
                      <div>Unknown</div>
                    )}
                  </Flexbox>
                </div>
              </div>
              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiClockOutline}
                    size={18}
                    className='context__icon'
                  />{' '}
                  Update Date
                </label>
                <div className='context__content'>
                  <Flexbox wrap='wrap'>
                    {currentDoc.head != null
                      ? getFormattedDateTime(
                          currentDoc.head.created,
                          undefined,
                          'MMM dd, yyyy, HH:mm'
                        )
                      : getFormattedDateTime(
                          currentDoc.updatedAt,
                          undefined,
                          'MMM dd, yyyy, HH:mm'
                        )}
                  </Flexbox>
                </div>
              </div>
              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiAccountCircleOutline}
                    size={18}
                    className='context__icon'
                  />{' '}
                  Updated by
                </label>
                <div className='context__content'>
                  <Flexbox wrap='wrap'>
                    {currentDoc.head != null ? (
                      (currentDoc.head.creators || []).length > 0 ? (
                        <>
                          {(currentDoc.head.creators || []).map((user) => (
                            <UserIcon
                              key={user.id}
                              user={usersMap.get(user.id) || user}
                              className='subtle'
                            />
                          ))}
                        </>
                      ) : (
                        ''
                      )
                    ) : (
                      <div>Unknown</div>
                    )}
                  </Flexbox>
                </div>
              </div>
              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiAccountMultiple}
                    size={18}
                    className='context__icon'
                  />{' '}
                  {plur('Contributor', contributorsState.contributors.length)}
                </label>
                <div className='context__content'>
                  <Flexbox wrap='wrap'>
                    {contributorsState.contributors.map((contributor) => (
                      <UserIcon
                        key={contributor.id}
                        user={usersMap.get(contributor.id) || contributor}
                        className='subtle'
                      />
                    ))}

                    {contributors.length > 5 && (
                      <SmallButton
                        variant='transparent'
                        onClick={() => setSliceContributors((prev) => !prev)}
                      >
                        {contributorsState.sliced > 0
                          ? `+${contributorsState.sliced}`
                          : '-'}
                      </SmallButton>
                    )}
                  </Flexbox>
                </div>
              </div>
              <div className='context__row'>
                <label className='context__label'>
                  <IconMdi
                    path={mdiHistory}
                    size={18}
                    className='context__icon'
                  />{' '}
                  History
                </label>
                <div className='context__content'>
                  {(subscription == null ||
                    subscription.plan === 'standard') && (
                    <Flexbox
                      justifyContent='flex-end'
                      style={{ width: '100%' }}
                    >
                      <UpgradeButton
                        origin='revision'
                        query={{ teamId: team.id, docId: currentDoc.id }}
                      />
                    </Flexbox>
                  )}
                </div>
              </div>
              <div className='context__row'>
                <div className='context__content'>
                  {revisionHistory != null && revisionHistory.length > 0 && (
                    <ul className='context__list'>
                      {revisionHistory.map((rev) => {
                        const creators = rev.creators || []
                        return (
                          <li className='context__revision' key={rev.id}>
                            {creators.length > 0 ? (
                              <Flexbox alignItems='center' wrap='wrap'>
                                {creators.map((user) => (
                                  <UserIcon
                                    key={user.id}
                                    user={usersMap.get(user.id) || user}
                                    className='context__revision__user subtle'
                                  />
                                ))}
                                <span className='context__revision__names'>
                                  {' '}
                                  {creators
                                    .map((user) => user.displayName)
                                    .join(',')}{' '}
                                  updated doc
                                </span>
                              </Flexbox>
                            ) : (
                              'Doc has been updated'
                            )}
                            <span className='context__revision__date'>
                              {getFormattedDateTime(rev.created)}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  <button
                    className='context__flexible__button'
                    onClick={revisionNavigateCallback}
                    id='dc-context-top-revisions'
                    disabled={subscription == null}
                  >
                    <Icon
                      path={mdiHistory}
                      className='context__icon'
                      size={18}
                    />
                    {subscription != null && subscription.plan === 'standard'
                      ? `See revisions ( last ${revisionHistoryStandardDays} days)`
                      : 'See full revisions'}
                  </button>
                </div>
              </div>
              <div className='context__break' />
              {currentUserPermissions != null && (
                <>
                  <div className='context__row'>
                    <label className='context__label' style={{ height: 37 }}>
                      <IconMdi
                        path={mdiLabelMultipleOutline}
                        size={18}
                        className='context__icon'
                      />{' '}
                      Labels
                    </label>
                    <div className='context__content'>
                      <DocTagsList team={team} doc={currentDoc} />
                    </div>
                  </div>
                  <div className='context__break' />
                  <DocShare currentDoc={currentDoc} team={team} />
                  <div className='context__row'>
                    {guestsOnThisDoc.length === 0 ? (
                      <label className='context__label'>
                        <Icon
                          path={mdiAccountMultiplePlusOutline}
                          className='context__icon'
                          size={18}
                        />
                        Guests
                        <div className='context__tooltip'>
                          <div className='context__tooltip__text'>
                            Guests are outsiders who you want to work with on
                            specific documents. They can be invited to
                            individual documents but not entire workspaces.
                          </div>
                          ?
                        </div>
                      </label>
                    ) : (
                      <label className='context__label'>
                        <Icon
                          path={mdiAccountMultiplePlusOutline}
                          className='context__icon'
                          size={18}
                        />
                        {guestsOnThisDoc.length}{' '}
                        {plur('Guest', guestsOnThisDoc.length)}
                      </label>
                    )}
                    {subscription == null ||
                    subscription.plan === 'standard' ? (
                      <UpgradeButton
                        className='context__badge'
                        origin='guest'
                        query={{ teamId: team.id, docId: currentDoc.id }}
                      />
                    ) : (
                      <Button
                        size='sm'
                        onClick={() =>
                          openModal(
                            <GuestsModal
                              teamId={team.id}
                              docId={currentDoc.id}
                            />,
                            { width: 'large' }
                          )
                        }
                        variant='transparent'
                      >
                        {guestsOnThisDoc.length > 0 ? 'Manage' : 'Invite'}
                      </Button>
                    )}
                  </div>
                  <div className='context__break' />
                  {backLinks.length > 0 && (
                    <>
                      <div className='context__column'>
                        <label className='context__label'>
                          {backLinks.length}{' '}
                          {plur('Backlink', backLinks.length)}
                        </label>
                        <ul className='context__list'>
                          {backLinks.map((doc) => (
                            <li key={doc.id}>
                              <DocLink
                                doc={doc}
                                team={team}
                                className='context__backlink'
                                id={`context__backlink__${doc.id}`}
                              >
                                <Icon
                                  path={mdiArrowBottomLeft}
                                  size={18}
                                  className='context__icon'
                                />
                                {getDocTitle(doc)}
                              </DocLink>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className='context__break' />
                    </>
                  )}
                  {openRenameDocForm != null && (
                    <button
                      className='context__row context__button'
                      id='dc-context-top-move'
                      onClick={openRenameDocForm}
                      disabled={updating}
                    >
                      <Icon
                        path={mdiPencil}
                        size={18}
                        className='context__icon'
                      />
                      <span>{sendingRename ? '...' : 'Rename'}</span>
                    </button>
                  )}
                  <button
                    className='context__row context__button'
                    id='dc-context-top-move'
                    onClick={() => openMoveForm(currentDoc)}
                    disabled={updating}
                  >
                    <Icon
                      path={mdiArrowRight}
                      size={18}
                      className='context__icon'
                    />
                    <span>{sendingMove ? '...' : 'Move'}</span>
                  </button>
                  <button
                    className='context__row context__button'
                    id='dc-context-top-template'
                    onClick={toggleTemplate}
                    disabled={sendingTemplate || sendingUpdateStatus}
                  >
                    <Icon
                      path={mdiPlusBoxMultipleOutline}
                      size={18}
                      className='context__icon'
                    />
                    <span>{sendingMove ? '...' : 'Save as a template'}</span>
                  </button>
                  <button
                    className='context__row context__button'
                    id='dc-context-top-archive'
                    onClick={() => {
                      if (currentDoc.archivedAt == null) {
                        sendUpdateStatus('archived')
                      } else {
                        sendUpdateStatus(null)
                      }
                    }}
                    disabled={
                      sendingTemplate || sendingTemplate || sendingUpdateStatus
                    }
                  >
                    <Icon
                      path={mdiArchiveOutline}
                      size={18}
                      className='context__icon'
                    />
                    <span>
                      {currentDoc.archivedAt != null ? 'Unarchive' : 'Archive'}
                    </span>
                  </button>
                  {currentDoc.archivedAt != null && (
                    <button
                      className='context__row context__button'
                      onClick={() => deleteDocHandler(currentDoc)}
                      id='dc-context-top-delete'
                    >
                      <Icon
                        path={mdiTrashCan}
                        size={18}
                        className='context__icon'
                      />
                      <span>{'Delete permanently'}</span>
                    </button>
                  )}
                  <div className='context__break' />
                </>
              )}
              <div className='context__break' />
              <DynamicExports
                openModal={openModal}
                currentDoc={currentDoc}
                editorRef={editorRef}
                team={team}
              />
            </div>
          </div>
        </div>
      </div>
    </Container>
  )
}

export const docContextWidth = 350

const Container = styled.div`
  .context__tooltip {
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${({ theme }) => theme.subtleBackgroundColor};
    color: ${({ theme }) => theme.baseTextColor};
    width: 20px;
    height: 20px;
    margin-left: ${({ theme }) => theme.space.xxsmall}px;

    .context__tooltip__text {
      display: none;
      border-radius: 3px;
      position: absolute;
      bottom: 100%;
      background: ${({ theme }) => theme.baseBackgroundColor};
      width: ${docContextWidth - 40}px;
      padding: ${({ theme }) => theme.space.xsmall}px;
      left: 50%;
      transform: translateX(-50%);
      line-height: ${({ theme }) => theme.fontSizes.medium}px;
    }

    &:hover {
      .context__tooltip__text {
        display: block;
      }
    }
  }

  .context__menu {
    z-index: ${zIndexModalsBackground + 1};
    margin: auto;
    width: ${docContextWidth}px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    border-left: 1px solid ${({ theme }) => theme.subtleBorderColor};
    border-radius: 0px;
    background-color: ${({ theme }) => theme.contextMenuColor};
    color: ${({ theme }) => theme.baseTextColor};
  }

  .context__container {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .context__scroll__container {
    height: 100%;
    overflow: auto;
    padding: ${({ theme }) => theme.space.xsmall}px 0;
    scrollbar-width: thin;
    &::-webkit-scrollbar {
      width: 6px;
    }
  }

  .context__scroll {
    flex: 1 1 auto;
    width: 100%;
    overflow: hidden auto;
  }

  .context__row,
  .context__column {
    position: relative;
    display: flex;
    align-items: flex-start;
    line-height: 30px;
    font-size: ${({ theme }) => theme.fontSizes.default}px;
    padding: 0px ${({ theme }) => theme.space.small}px;
    height: fit-content;
  }
  .context__header {
    font-size: ${({ theme }) => theme.fontSizes.medium}px;
  }

  .context__column {
    flex-direction: column;
  }

  .context__column + .context__break,
  .context__row + .context__break {
    margin-top: ${({ theme }) => theme.space.xxsmall}px;
    margin-bottom: ${({ theme }) => theme.space.xxsmall}px;
  }

  .context__row + .context__row,
  .context__break + .context__row,
  .context__column + .context__column,
  .context__break + .context__column {
    padding-top: ${({ theme }) => theme.space.xxsmall}px;
    padding-bottom: ${({ theme }) => theme.space.xxsmall}px;
  }

  .context__label {
    display: flex;
    align-items: center;
    color: ${({ theme }) => theme.baseTextColor};
    font-size: 13px;
    width: 120px;
    flex: 0 0 auto;
    margin-bottom: 0;
    margin-right: ${({ theme }) => theme.space.small}px;
    cursor: inherit;
  }

  .context__content {
    line-height: inherit;
    min-height: 30px;
    flex: 1;

    &.single__line {
      display: flex;
      align-items: center;
    }
  }
  .context__content__date_select {
    width: 100%;
  }

  .context__break {
    display: block;
    height: 1px;
    margin: 0px ${({ theme }) => theme.space.small}px;
    background-color: ${({ theme }) => theme.subtleBorderColor};
  }

  .context__toggle {
    ${topbarIconButtonStyle}
    position: absolute;
    top: 6px;
    left: -41px;
    z-index: ${zIndexModalsBackground + 2};
  }

  .context__button {
    width: 100%;
    text-align: left;
  }

  .context__flexible__button {
    flex-wrap: wrap;
    border-radius: 3px;
    max-width: 96%;
    width: auto;
    margin: 0 auto;
    padding: 2px 5px;
  }

  .context__button,
  .context__flexible__button {
    display: flex;
    align-items: center;
    background: none;
    outline: none;
    color: ${({ theme }) => theme.baseTextColor};
    cursor: pointer;
    font-size: 13px;
    &:hover,
    &:focus {
      background-color: ${({ theme }) => theme.subtleBackgroundColor};
      color: ${({ theme }) => theme.emphasizedTextColor};
    }

    &:disabled {
      color: ${({ theme }) => theme.subtleTextColor};

      &:hover,
      &:focus {
        color: ${({ theme }) => theme.subtleTextColor} !important;
        background-color: transparent;
        cursor: not-allowed;
      }
    }
  }

  .context__flexible__button + div {
    margin: ${({ theme }) => theme.space.xsmall}px 0;
  }

  .context__badge {
    background: ${({ theme }) => theme.primaryBackgroundColor};
  }

  .context__label + .context__badge {
    margin-left: 0;
  }

  .context__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .context__icon {
    margin-right: ${({ theme }) => theme.space.xsmall}px;
    flex: 0 0 auto;
  }

  context__backlink + context__backlink {
    margin-top: ${({ theme }) => theme.space.xsmall}px;
  }

  .context__backlink {
    ${linkText};
    display: flex;
    align-items: end;
    line-height: 18px;
    text-decoration: none;
  }

  .context__list + .context__flexible__button {
    margin-top: ${({ theme }) => theme.space.default}px;
  }

  .context__revision + .context__revision {
    margin-top: ${({ theme }) => theme.space.default}px;

    &::before {
      height: 15px;
      width: 1px;
      background-color: ${({ theme }) => theme.subtleBackgroundColor};
      content: '';
      position: absolute;
      left: 11px;
      top: -19px;
    }
  }

  .context__revision {
    display: flex;
    flex-wrap: wrap;
    line-height: 18px;
    align-items: baseline;
    position: relative;
  }

  .context__revision__user {
    display: inline-block;
  }

  .context__revision__user + .context__revision__names {
    padding-left: ${({ theme }) => theme.space.xsmall}px;
  }

  .context__revision__date {
    display: block;
    width: 100%;
    padding-top: ${({ theme }) => theme.space.xxsmall}px;
    color: ${({ theme }) => theme.subtleTextColor};
    font-size: 13px;
  }

  &.active {
    .context__menu {
      right: 0px;
    }

    .context__toggle {
      left: -41px;
    }

    .placeholder {
      width: ${docContextWidth + 45}px;
    }
  }
`

export default DocContextMenu
