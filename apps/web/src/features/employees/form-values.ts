/** Kiểu giá trị biểu mẫu hồ sơ cán bộ và chuyển đổi sang payload API. */
import type { PickedEmployee } from './EmployeePicker';

export interface AssignmentFormValues {
  unitId: string;
  positionId: string;
  jobPositionId: string;
  manager: PickedEmployee | null;
  startDate: string;
  duties: string;
  decisionRef: string;
}

export interface ProfileFormValues {
  fullName: string;
  gender: '' | 'MALE' | 'FEMALE';
  dateOfBirth: string;
  email: string;
  phone: string;
  partyPosition: string;
  govPosition: string;
  unionPosition: string;
}

export const emptyProfile: ProfileFormValues = {
  fullName: '',
  gender: '',
  dateOfBirth: '',
  email: '',
  phone: '',
  partyPosition: '',
  govPosition: '',
  unionPosition: '',
};

/** Chuyển giá trị biểu mẫu sang payload API (manager → managerEmployeeId). */
export function toAssignmentPayload(v: AssignmentFormValues) {
  return {
    unitId: v.unitId,
    positionId: v.positionId,
    jobPositionId: v.jobPositionId,
    managerEmployeeId: v.manager?.id ?? '',
    startDate: v.startDate,
    duties: v.duties,
    decisionRef: v.decisionRef,
  };
}
