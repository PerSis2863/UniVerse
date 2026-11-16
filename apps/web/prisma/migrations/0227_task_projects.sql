-- M230 (the owner, 16 Nov, after OpenProject): projects on task boards. A card can start on a day (its Gantt bar
-- runs from there to its due date) and be a milestone (a diamond on its day); time spent on it is logged.
ALTER TABLE tasks ADD COLUMN startAt DATETIME;
ALTER TABLE tasks ADD COLUMN milestone BOOLEAN NOT NULL DEFAULT 0;

CREATE TABLE task_time_entries (
  id TEXT NOT NULL PRIMARY KEY,
  taskId TEXT NOT NULL,
  boardId TEXT NOT NULL,
  userId TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  note TEXT,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT task_time_entries_taskId_fkey FOREIGN KEY (taskId) REFERENCES tasks (id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX task_time_entries_taskId_idx ON task_time_entries(taskId);
CREATE INDEX task_time_entries_boardId_idx ON task_time_entries(boardId);
