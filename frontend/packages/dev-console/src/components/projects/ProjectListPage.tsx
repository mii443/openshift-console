import type { FC, ComponentType, ReactNode } from 'react';
import { ListPage } from '@console/internal/components/factory';
import { NamespacesList, ProjectsTable } from '@console/internal/components/namespace';
import { PageHeading } from '@console/shared/src/components/heading/PageHeading';
import { FLAGS } from '@console/shared/src/constants/common';
import { useFlag } from '@console/shared/src/hooks/useFlag';
import './ProjectListPage.scss';

export type ProjectListPageProps = {
  title: string;
  listComponent?: ComponentType<any>;
  badge?: ReactNode;
  helpText?: ReactNode;
};
const ProjectListPage: FC<ProjectListPageProps> = ({
  badge,
  title,
  listComponent,
  helpText,
  ...listPageProps
}) => {
  const isOpenShift = useFlag(FLAGS.OPENSHIFT);
  const defaultListComponent = isOpenShift ? ProjectsTable : NamespacesList;

  return (
    <div className="odc-project-list-page">
      <PageHeading title={title} badge={badge} helpText={helpText} />
      <ListPage
        {...listPageProps}
        showTitle={false}
        kind={isOpenShift ? 'Project' : 'Namespace'}
        ListComponent={listComponent || defaultListComponent}
        canCreate={false}
        filterLabel="by name or display name"
        textFilter="project-name"
        omitFilterToolbar
      />
    </div>
  );
};

export default ProjectListPage;
