/**
 * Tag Configuration
 * 
 * This file defines all available tags in the system and categorizes them by:
 * 1. Where they can be configured (routine builder vs per-log)
 * 2. Whether they are "default" (always applied) or "selectable" (user chooses at log time)
 * 
 * Tags fall into two categories when configuring in the routine builder:
 * - DEFAULT TAGS: Always applied to logs using this routine
 * - SELECTABLE TAGS: Made available for the user to choose when logging
 */

export interface TagOption {
  value: string;
  label: string;
  icon?: string;
  description: string;
  /** Tags that can be set as defaults in routine builder */
  allowAsDefault?: boolean;
  /** Tags that can be made selectable for per-log choice */
  allowAsSelectable?: boolean;
}

export interface TagCategory {
  id: string;
  label: string;
  description: string;
  tags: TagOption[];
}

// ============================================================================
// ROUTINE BUILDER TAGS
// These tags are configured when creating/editing a routine template
// ============================================================================

export const EFFORT_TAGS: TagCategory = {
  id: 'effort',
  label: 'Effort Level',
  description: 'Classify the expected intensity of dives',
  tags: [
    { 
      value: 'max', 
      label: 'Max', 
      icon: '🔥', 
      description: 'True maximum effort attempt',
      allowAsDefault: true,
      allowAsSelectable: true
    },
    { 
      value: 'submax', 
      label: 'Sub-Max', 
      icon: '💪', 
      description: 'Below full capacity, controlled effort',
      allowAsDefault: true,
      allowAsSelectable: true
    },
    { 
      value: 'warmup', 
      label: 'Warm-up', 
      icon: '🌡️', 
      description: 'Warm-up or preparation dive',
      allowAsDefault: true,
      allowAsSelectable: true
    },
    { 
      value: 'recovery', 
      label: 'Recovery', 
      icon: '🌿', 
      description: 'Easy recovery dive',
      allowAsDefault: true,
      allowAsSelectable: true
    }
  ]
};

export const ADAPTATION_TAGS: TagCategory = {
  id: 'adaptation',
  label: 'Training Adaptation',
  description: 'What physiological adaptation does this routine target?',
  tags: [
    { 
      value: 'co2', 
      label: 'CO₂ Tolerance', 
      icon: '💨', 
      description: 'Build carbon dioxide tolerance',
      allowAsDefault: true,
      allowAsSelectable: false
    },
    { 
      value: 'o2', 
      label: 'O₂ Training', 
      icon: '🫁', 
      description: 'Hypoxic / oxygen depletion training',
      allowAsDefault: true,
      allowAsSelectable: false
    },
    { 
      value: 'technique', 
      label: 'Technique', 
      icon: '🎯', 
      description: 'Focus on form and efficiency',
      allowAsDefault: true,
      allowAsSelectable: false
    },
    { 
      value: 'mental', 
      label: 'Mental', 
      icon: '🧠', 
      description: 'Mental training and relaxation',
      allowAsDefault: true,
      allowAsSelectable: false
    },
    { 
      value: 'endurance', 
      label: 'Endurance', 
      icon: '🏋️', 
      description: 'Build stamina and capacity',
      allowAsDefault: true,
      allowAsSelectable: false
    },
    { 
      value: 'power', 
      label: 'Power', 
      icon: '⚡', 
      description: 'Explosive power training',
      allowAsDefault: true,
      allowAsSelectable: false
    }
  ]
};

export const CONTEXT_TAGS: TagCategory = {
  id: 'context',
  label: 'Session Context',
  description: 'Context tags that can be selected per log',
  tags: [
    { 
      value: 'training', 
      label: 'Training', 
      icon: '📚', 
      description: 'Regular training session',
      allowAsDefault: true,
      allowAsSelectable: true
    },
    { 
      value: 'competition', 
      label: 'Competition', 
      icon: '🏆', 
      description: 'Competition dive',
      allowAsDefault: false,
      allowAsSelectable: true
    },
    { 
      value: 'pb-attempt', 
      label: 'PB Attempt', 
      icon: '⭐', 
      description: 'Personal best attempt',
      allowAsDefault: false,
      allowAsSelectable: true
    },
    { 
      value: 'fun', 
      label: 'Fun Dive', 
      icon: '🎉', 
      description: 'Casual, enjoyment-focused',
      allowAsDefault: false,
      allowAsSelectable: true
    },
    { 
      value: 'experimental', 
      label: 'Experimental', 
      icon: '🧪', 
      description: 'Testing new techniques',
      allowAsDefault: false,
      allowAsSelectable: true
    }
  ]
};

export const DIFFICULTY_TAGS: TagCategory = {
  id: 'difficulty',
  label: 'Difficulty Level',
  description: 'How challenging is this routine?',
  tags: [
    { 
      value: 'beginner', 
      label: 'Beginner', 
      icon: '🌱', 
      description: 'Suitable for beginners',
      allowAsDefault: true,
      allowAsSelectable: false
    },
    { 
      value: 'intermediate', 
      label: 'Intermediate', 
      icon: '🌳', 
      description: 'For intermediate freedivers',
      allowAsDefault: true,
      allowAsSelectable: false
    },
    { 
      value: 'advanced', 
      label: 'Advanced', 
      icon: '🏔️', 
      description: 'Requires advanced skills',
      allowAsDefault: true,
      allowAsSelectable: false
    },
    { 
      value: 'expert', 
      label: 'Expert', 
      icon: '🔱', 
      description: 'Expert level only',
      allowAsDefault: true,
      allowAsSelectable: false
    }
  ]
};

// ============================================================================
// ALL TAG CATEGORIES FOR ROUTINE BUILDER
// ============================================================================

export const ALL_TAG_CATEGORIES: TagCategory[] = [
  EFFORT_TAGS,
  ADAPTATION_TAGS,
  CONTEXT_TAGS,
  DIFFICULTY_TAGS
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all tags that can be set as defaults
 */
export function getDefaultableTags(): TagOption[] {
  return ALL_TAG_CATEGORIES.flatMap(cat => 
    cat.tags.filter(tag => tag.allowAsDefault)
  );
}

/**
 * Get all tags that can be made selectable
 */
export function getSelectableTags(): TagOption[] {
  return ALL_TAG_CATEGORIES.flatMap(cat => 
    cat.tags.filter(tag => tag.allowAsSelectable)
  );
}

/**
 * Get a tag option by value
 */
export function getTagByValue(value: string): TagOption | undefined {
  for (const category of ALL_TAG_CATEGORIES) {
    const tag = category.tags.find(t => t.value === value);
    if (tag) return tag;
  }
  return undefined;
}

/**
 * Get category for a tag value
 */
export function getCategoryForTag(value: string): TagCategory | undefined {
  return ALL_TAG_CATEGORIES.find(cat => 
    cat.tags.some(t => t.value === value)
  );
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type TagValue = typeof ALL_TAG_CATEGORIES[number]['tags'][number]['value'];
