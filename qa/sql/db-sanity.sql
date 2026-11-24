/* Database sanity checks run by the QA suite after each staging deploy.
   Output: one line per check — ID|status|detail   (status = pass | fail). Read-only. */
SET NOCOUNT ON;
DECLARE @r TABLE (Id VARCHAR(20), Status VARCHAR(4), Detail NVARCHAR(400));

DECLARE @n INT;
SELECT @n = COUNT(*) FROM dbo.__Migrations;
INSERT @r VALUES ('DB-MAJ-01', CASE WHEN @n > 0 THEN 'pass' ELSE 'fail' END, CONCAT(@n, N' migrations recorded'));

SELECT @n = COUNT(*) FROM (SELECT InvoiceNumber FROM sales.Sale GROUP BY InvoiceNumber HAVING COUNT(*) > 1) d;
INSERT @r VALUES ('DB-MAJ-02', CASE WHEN @n = 0 THEN 'pass' ELSE 'fail' END, CONCAT(@n, N' invoice numbers used more than once'));

SELECT @n = COUNT(*) FROM sales.Sale s WHERE NOT EXISTS (SELECT 1 FROM sales.SaleLine l WHERE l.SaleId = s.SaleId);
INSERT @r VALUES ('DB-MOD-01', CASE WHEN @n = 0 THEN 'pass' ELSE 'fail' END, CONCAT(@n, N' sales have no lines'));

SELECT @n = COUNT(*) FROM sales.Sale s WHERE NOT EXISTS (SELECT 1 FROM sales.SalePayment p WHERE p.SaleId = s.SaleId);
INSERT @r VALUES ('DB-MOD-02', CASE WHEN @n = 0 THEN 'pass' ELSE 'fail' END, CONCAT(@n, N' sales have no payment'));

SELECT @n = COUNT(*) FROM sys.foreign_keys WHERE is_disabled = 1 OR is_not_trusted = 1;
INSERT @r VALUES ('DB-MOD-03', CASE WHEN @n = 0 THEN 'pass' ELSE 'fail' END, CONCAT(@n, N' foreign keys disabled or not trusted'));

SELECT @n = COUNT(*) FROM sys.check_constraints WHERE is_disabled = 1 OR is_not_trusted = 1;
INSERT @r VALUES ('DB-MIN-01', CASE WHEN @n = 0 THEN 'pass' ELSE 'fail' END, CONCAT(@n, N' check constraints disabled or not trusted'));

SELECT Id + '|' + Status + '|' + Detail FROM @r;
