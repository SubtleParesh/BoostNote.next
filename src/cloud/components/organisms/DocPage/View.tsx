import React, { useCallback } from 'react'
import {
  SerializedDocWithBookmark,
  SerializedDoc,
} from '../../../interfaces/db/doc'
import DocLimitReachedBanner from '../../molecules/Banner/SubLimitReachedBanner'
import { getDocTitle } from '../../../lib/utils/patterns'
import styled from '../../../lib/styled'
import CustomButton from '../../atoms/buttons/CustomButton'
import ColoredBlock from '../../atoms/ColoredBlock'
import { useNav } from '../../../lib/stores/nav'
import { SerializedTeam } from '../../../interfaces/db/team'
import { unarchiveDoc } from '../../../api/teams/docs'
import { usePage } from '../../../lib/stores/pageStore'
import { useToast } from '../../../lib/stores/toast'
import { usePreferences } from '../../../lib/stores/preferences'
import AppLayout from '../../layouts/AppLayout'
import BreadCrumbs from '../RightSideTopBar/BreadCrumbs'
import {
  StyledTopbarVerticalSplit,
  rightSideTopBarHeight,
} from '../RightSideTopBar/styled'
import DocBookmark from '../RightSideTopBar/DocTopbar/DocBookmark'
import { rightSidePageLayout } from '../../../lib/styled/styleFunctions'
import { SerializedUser } from '../../../interfaces/db/user'
import DocContextMenu from '../Topbar/Controls/ControlsContextMenu/DocContextMenu'
import MarkdownView from '../../atoms/MarkdownView'

interface ViewPageProps {
  team: SerializedTeam
  doc: SerializedDocWithBookmark
  editable: boolean
  contributors: SerializedUser[]
  backLinks: SerializedDoc[]
}

const ViewPage = ({
  doc,
  editable,
  team,
  contributors,
  backLinks,
}: ViewPageProps) => {
  const { hoverSidebarOn } = usePreferences()
  const { updateDocsMap, deleteDocHandler } = useNav()
  const { setPartialPageData } = usePage()
  const { pushMessage } = useToast()

  const unarchiveHandler = useCallback(async () => {
    try {
      const data = await unarchiveDoc(doc.teamId, doc.id)
      updateDocsMap([data.doc.id, data.doc])
      setPartialPageData({ pageDoc: data.doc })
    } catch (error) {
      pushMessage({
        title: 'Error',
        description: 'Could not unarchive this doc',
      })
    }
  }, [doc, pushMessage, updateDocsMap, setPartialPageData])

  return (
    <AppLayout
      rightLayout={{
        fullWidth: false,
        topbar: {
          left: (
            <>
              <BreadCrumbs team={team} minimize={true} />
              <StyledTopbarVerticalSplit />
            </>
          ),
          right: (
            <>
              <StyledTopbarVerticalSplit className='transparent' />
              <DocBookmark currentDoc={doc} />
              <StyledTopbarVerticalSplit className='transparent' />
              <DocContextMenu
                currentDoc={doc}
                team={team}
                contributors={contributors}
                backLinks={backLinks}
              />
            </>
          ),
        },
      }}
    >
      {doc.archivedAt != null && (
        <ColoredBlock variant='warning' className='float-on-top'>
          <p>The document has been archived.</p>
          <CustomButton onClick={unarchiveHandler}>Unarchive</CustomButton>
          <CustomButton onClick={() => deleteDocHandler(doc)}>
            Delete
          </CustomButton>
        </ColoredBlock>
      )}
      <StyledViewDocLayout>
        <StyledTitle>{getDocTitle(doc, 'Untitled..')}</StyledTitle>
        <StyledBannerWrap>
          {!editable && <DocLimitReachedBanner />}
        </StyledBannerWrap>
        <StyledHoverZone onMouseEnter={() => hoverSidebarOn()} />
        <StyledContent>
          {doc.head != null ? (
            <>
              <MarkdownView content={doc.head.content} />
            </>
          ) : (
            <>
              <StyledPlaceholderContent>
                The document is empty
              </StyledPlaceholderContent>
            </>
          )}
        </StyledContent>
      </StyledViewDocLayout>
    </AppLayout>
  )
}

const StyledViewDocLayout = styled.div`
  ${rightSidePageLayout}
  margin: auto;
`

const StyledContent = styled.div`
  border: 0;
  outline: 0;
  resize: none;
  background: none;
  color: ${({ theme }) => theme.emphasizedTextColor};
  font-size: ${({ theme }) => theme.fontSizes.default}px;
  display: block;
  width: 100%;
  flex: 1 1 auto;
`

const StyledTitle = styled.h2`
  display: block;
  margin-bottom: ${({ theme }) => theme.space.default}px;
  width: 100%;
  background: 0;
  color: ${({ theme }) => theme.emphasizedTextColor};
  font-size: ${({ theme }) => theme.fontSizes.xxxxlarge}px;
  text-align: left;
  text-overflow: ellipsis;
  outline: 0;
  overflow: hidden;
  padding-top: calc(
    ${rightSideTopBarHeight}px + ${({ theme }) => theme.space.large}px
  );
`

const StyledPlaceholderContent = styled.div`
  color: ${({ theme }) => theme.subtleTextColor};
`

const StyledBannerWrap = styled.div`
  width: 100%;
`

const StyledHoverZone = styled.div`
  position: absolute;
  height: 100vh;
  top: 0px;
  left: 0px;
  width: 200px;
  transform: translate3d(-100%, 0, 0);
`

export default ViewPage
