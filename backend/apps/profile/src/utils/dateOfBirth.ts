
export const	INVALID_DATE_OF_BIRTH = 'Invalid date of birth: it must be a real date and you must be at least 18 years old';

// Validates that the date of birth makes the user at least 18 years old and not in the future.
export function getDateOfBirthError(dob: string): string | null
{
	try
	{
		const dobDate = new Date(`${dob}T00:00:00Z`);
		if (isNaN(dobDate.getTime()))
			return (INVALID_DATE_OF_BIRTH);

		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);

		if (dobDate > today)
			return (INVALID_DATE_OF_BIRTH);

		const age = today.getUTCFullYear() - dobDate.getUTCFullYear();
		const monthDiff = today.getUTCMonth() - dobDate.getUTCMonth();
		const dayDiff = today.getUTCDate() - dobDate.getUTCDate();

		const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

		if (actualAge < 18 || actualAge > 120)
			return (INVALID_DATE_OF_BIRTH);
	}
	catch
	{
		return (INVALID_DATE_OF_BIRTH);
	}

	return (null);
}

// Checks for parsing errors from the database (not a real calendar date).
export function isInvalidDateOfBirth(error: any): boolean
{
	if (!error)
		return (false);

	// 22008 = not a real calendar date (e.g. 2023-02-30), refused when cast to DATE
	return (error.code === '22008');
}
